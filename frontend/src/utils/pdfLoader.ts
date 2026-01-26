/**
 * PDF.js加载工具
 * @author ttbye
 */
let pdfjsLib: any = null;

export async function loadPdfJs() {
  if (pdfjsLib) {
    return pdfjsLib;
  }

  try {
    // 使用标准导入方式（Vite构建时能正确解析）
    const module = await import('pdfjs-dist');
    pdfjsLib = module.default || module;
    
    // 如果还是没有，尝试从window获取（用于某些特殊情况）
    if (!pdfjsLib && (window as any).pdfjsLib) {
      pdfjsLib = (window as any).pdfjsLib;
    }
    
    if (!pdfjsLib) {
      throw new Error('无法加载PDF.js库');
    }
    
    // 设置worker - 使用本地 worker（避免CDN依赖）
    if (pdfjsLib.GlobalWorkerOptions) {
      // 使用本地 worker 文件，从 public/pdfjs/worker/ 目录加载
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/worker/pdf.worker.min.js';
      console.log('[PDF.js] 使用本地 worker:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    }
    
    return pdfjsLib;
  } catch (error: any) {
    console.error('加载PDF.js失败:', error);
    throw new Error(`PDF.js库加载失败，请确保已安装pdfjs-dist依赖: ${error.message}`);
  }
}

