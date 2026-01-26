/**
 * 通用文本选择模块
 * 支持所有格式书籍（EPUB、PDF、TXT、DOCX、XLSX等）
 */

export interface SelectionInfo {
  text: string;
  x: number;
  y: number;
  cfiRange?: string | null; // EPUB 特有，其他格式可为 null
}

/**
 * 获取文本选择信息
 */
export function getSelectionInfo(
  doc: Document,
  win: Window | null,
  iframeEl: HTMLElement | null,
  getCfiRange?: (range: Range) => string | null
): SelectionInfo | null {
  try {
    const selection = win?.getSelection?.() || doc.getSelection?.();
    if (!selection || selection.isCollapsed) return null;

    const text = selection.toString().trim();
    if (!text || text.length < 2) return null; // 最小字符数

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 计算相对主窗口的坐标
    const iframeRect = iframeEl?.getBoundingClientRect();
    const x = (iframeRect?.left ?? 0) + rect.left + rect.width / 2;
    const y = (iframeRect?.top ?? 0) + rect.top;

    // 计算 CFI range（EPUB 特有，其他格式可为 null）
    let cfiRange: string | null = null;
    if (getCfiRange) {
      try {
        cfiRange = getCfiRange(range);
      } catch (e) {
        cfiRange = null;
      }
    }

    return { text, x, y, cfiRange };
  } catch (e) {
    return null;
  }
}

/**
 * 创建安全的选择事件发射器
 */
export function createSafeSelectionEmitter(
  doc: Document,
  win: Window | null,
  iframeEl: HTMLElement | null,
  getCfiRange?: (range: Range) => string | null
) {
  return () => {
    try {
      const selection = win?.getSelection?.() || doc.getSelection?.();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (!text || text.length < 2) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // rect 过小也视为误触
      if (!rect || (rect.width < 2 && rect.height < 8)) return;

      const info = getSelectionInfo(doc, win, iframeEl, getCfiRange);
      if (!info) return;

      window.dispatchEvent(
        new CustomEvent('__reader_text_selection', {
          detail: info,
        })
      );
    } catch {
      // ignore
    }
  };
}

/**
 * 选择事件监听器状态
 */
export interface SelectionListenerState {
  touchStart: { x: number; y: number } | null;
  touchMoved: boolean;
  mouseDown: boolean;
  mouseMoved: boolean;
  mouseStart: { x: number; y: number } | null;
}

const MOVE_PX = 12; // 认为是"滑动/滚动"的阈值
const MIN_TEXT = 2; // 认为是"有效选择"的最小字符数

/**
 * 创建选择事件监听器
 */
export function createSelectionListeners(
  doc: Document,
  win: Window | null,
  iframeEl: HTMLElement | null,
  getCfiRange?: (range: Range) => string | null
): () => void {
  const state: SelectionListenerState = {
    touchStart: null,
    touchMoved: false,
    mouseDown: false,
    mouseMoved: false,
    mouseStart: null,
  };

  const emitSelection = createSafeSelectionEmitter(doc, win, iframeEl, getCfiRange);

  const onMouseDown = (e: MouseEvent) => {
    state.mouseDown = true;
    state.mouseMoved = false;
    state.mouseStart = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!state.mouseDown || !state.mouseStart) return;
    const dx = Math.abs(e.clientX - state.mouseStart.x);
    const dy = Math.abs(e.clientY - state.mouseStart.y);
    if (dx > MOVE_PX || dy > MOVE_PX) state.mouseMoved = true;
  };

  const onMouseUp = () => {
    const moved = state.mouseMoved;
    state.mouseDown = false;
    state.mouseMoved = false;
    state.mouseStart = null;
    if (moved) return;
    setTimeout(emitSelection, 0);
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    state.touchStart = { x: t.clientX, y: t.clientY };
    state.touchMoved = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches?.[0];
    if (!t || !state.touchStart) return;
    const dx = Math.abs(t.clientX - state.touchStart.x);
    const dy = Math.abs(t.clientY - state.touchStart.y);
    if (dx > MOVE_PX || dy > MOVE_PX) state.touchMoved = true;
  };

  const onTouchEnd = () => {
    const moved = state.touchMoved;
    state.touchStart = null;
    state.touchMoved = false;
    if (moved) return;
    setTimeout(emitSelection, 0);
  };

  // 注册事件监听器
  doc.addEventListener('mousedown', onMouseDown, { capture: true });
  doc.addEventListener('mousemove', onMouseMove, { capture: true });
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  doc.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
  doc.addEventListener('touchend', onTouchEnd);

  // 返回清理函数
  return () => {
    doc.removeEventListener('mousedown', onMouseDown, { capture: true } as any);
    doc.removeEventListener('mousemove', onMouseMove, { capture: true } as any);
    doc.removeEventListener('mouseup', onMouseUp);
    doc.removeEventListener('touchstart', onTouchStart, { passive: true, capture: true } as any);
    doc.removeEventListener('touchmove', onTouchMove, { passive: true, capture: true } as any);
    doc.removeEventListener('touchend', onTouchEnd);
  };
}

/**
 * 选择句子（长按功能）
 * 支持跨多个 DOM 节点选择完整句子或段落
 */
const SENTENCE_BREAK = /[。！？；;.!?\n\r]/;
const PARAGRAPH_BREAK = /[\n\r]/;

/**
 * 向前查找句子或段落起始位置
 */
function findSentenceStart(
  doc: Document,
  startNode: Node,
  startOffset: number
): { node: Node; offset: number } | null {
  try {
    let currentNode: Node | null = startNode;
    let currentOffset = startOffset;
    let text = '';
    let offsetInText = 0;

    // 如果起始节点不是文本节点，找到包含它的文本节点
    if (currentNode.nodeType !== Node.TEXT_NODE) {
      const walker = doc.createTreeWalker(currentNode, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!textNode) return null;
      currentNode = textNode;
      currentOffset = 0;
    }

    // 收集当前节点及之前的所有文本
    const textNodes: Array<{ node: Node; text: string }> = [];
    let node: Node | null = currentNode;
    
    // 向前遍历收集文本节点
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent || '';
        textNodes.unshift({ node, text: nodeText });
        if (node === currentNode) {
          offsetInText = currentOffset;
        } else {
          offsetInText += nodeText.length;
        }
      }
      
      // 向前查找兄弟节点
      if (node.previousSibling) {
        node = node.previousSibling;
        // 如果找到段落分隔符，停止
        if (node.nodeType === Node.TEXT_NODE && PARAGRAPH_BREAK.test(node.textContent || '')) {
          break;
        }
        // 继续查找最后一个文本节点
        while (node.lastChild) {
          node = node.lastChild;
        }
      } else {
        node = node.parentElement;
        if (!node || node.tagName === 'BODY' || node.tagName === 'HTML') break;
        // 如果遇到段落标签，停止
        if (['P', 'DIV', 'BR'].includes(node.tagName)) {
          break;
        }
      }
    }

    // 合并所有文本
    text = textNodes.map(n => n.text).join('');
    
    // 在合并的文本中查找句子起始位置
    let start = offsetInText;
    while (start > 0 && !SENTENCE_BREAK.test(text[start - 1])) {
      start--;
    }

    // 找到对应的节点和偏移量
    let accumulatedLength = 0;
    for (const item of textNodes) {
      const nodeLength = item.text.length;
      if (start <= accumulatedLength + nodeLength) {
        return { node: item.node, offset: start - accumulatedLength };
      }
      accumulatedLength += nodeLength;
    }

    // 如果没找到，返回第一个节点
    if (textNodes.length > 0) {
      return { node: textNodes[0].node, offset: 0 };
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 向后查找句子或段落结束位置
 */
function findSentenceEnd(
  doc: Document,
  startNode: Node,
  startOffset: number
): { node: Node; offset: number } | null {
  try {
    let currentNode: Node | null = startNode;
    let currentOffset = startOffset;
    let text = '';
    let offsetInText = 0;

    // 如果起始节点不是文本节点，找到包含它的文本节点
    if (currentNode.nodeType !== Node.TEXT_NODE) {
      const walker = doc.createTreeWalker(currentNode, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!textNode) return null;
      currentNode = textNode;
      currentOffset = 0;
    }

    // 收集当前节点及之后的所有文本
    const textNodes: Array<{ node: Node; text: string }> = [];
    let node: Node | null = currentNode;
    
    // 向后遍历收集文本节点
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent || '';
        textNodes.push({ node, text: nodeText });
        if (node === currentNode) {
          offsetInText = currentOffset;
        }
      }
      
      // 向后查找兄弟节点
      if (node.nextSibling) {
        node = node.nextSibling;
        // 继续查找第一个文本节点
        while (node.firstChild) {
          node = node.firstChild;
        }
      } else {
        node = node.parentElement;
        if (!node || node.tagName === 'BODY' || node.tagName === 'HTML') break;
        // 如果遇到段落标签，停止
        if (['P', 'DIV', 'BR'].includes(node.tagName)) {
          break;
        }
      }
    }

    // 合并所有文本
    text = textNodes.map(n => n.text).join('');
    
    // 在合并的文本中查找句子结束位置
    let end = offsetInText;
    while (end < text.length && !SENTENCE_BREAK.test(text[end])) {
      end++;
    }
    if (end < text.length) end++; // 包含句号本身

    // 找到对应的节点和偏移量
    let accumulatedLength = 0;
    for (const item of textNodes) {
      const nodeLength = item.text.length;
      if (end <= accumulatedLength + nodeLength) {
        return { node: item.node, offset: end - accumulatedLength };
      }
      accumulatedLength += nodeLength;
    }

    // 如果没找到，返回最后一个节点
    if (textNodes.length > 0) {
      const lastNode = textNodes[textNodes.length - 1];
      return { node: lastNode.node, offset: lastNode.text.length };
    }

    return null;
  } catch (e) {
    return null;
  }
}

export function selectSentenceAtPoint(
  doc: Document,
  win: Window | null,
  clientX: number,
  clientY: number
): boolean {
  try {
    const anyDoc = doc as any;
    let range: Range | null = null;
    if (typeof anyDoc.caretRangeFromPoint === 'function') {
      range = anyDoc.caretRangeFromPoint(clientX, clientY);
    } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
      const pos = anyDoc.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range) return false;

    let startNode = range.startContainer;
    let startOffset = range.startOffset;
    
    // 如果起始节点不是文本节点，找到包含它的文本节点
    if (startNode.nodeType !== Node.TEXT_NODE) {
      const walker = doc.createTreeWalker(startNode, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!textNode) return false;
      startNode = textNode;
      startOffset = 0;
    }

    // 查找句子起始和结束位置（支持跨节点）
    const startPos = findSentenceStart(doc, startNode, startOffset);
    const endPos = findSentenceEnd(doc, startNode, startOffset);

    if (!startPos || !endPos) return false;

    // 验证选择范围是否有效
    const startText = startPos.node.textContent || '';
    const endText = endPos.node.textContent || '';
    if (startPos.offset < 0 || startPos.offset > startText.length) return false;
    if (endPos.offset < 0 || endPos.offset > endText.length) return false;

    const sel = win?.getSelection?.() || doc.getSelection?.();
    if (!sel) return false;

    const sentenceRange = doc.createRange();
    sentenceRange.setStart(startPos.node, startPos.offset);
    sentenceRange.setEnd(endPos.node, endPos.offset);
    
    // 验证选择的内容长度
    const selectedText = sentenceRange.toString().trim();
    if (selectedText.length < 2) return false;

    sel.removeAllRanges();
    sel.addRange(sentenceRange);
    return true;
  } catch (e) {
    return false;
  }
}

