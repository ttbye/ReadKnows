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
    // 尝试不同的导入方式
    const module = await import('pdfjs-dist');
    pdfjsLib = module.default || module;
    
    // 如果还是没有，尝试从window获取
    if (!pdfjsLib && (window as any).pdfjsLib) {
      pdfjsLib = (window as any).pdfjsLib;
    }
    
    if (!pdfjsLib) {
      throw new Error('无法加载PDF.js库');
    }
    
    // 设置worker
    if (pdfjsLib.GlobalWorkerOptions) {
      const version = pdfjsLib.version || '3.11.174';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
    }
    
    return pdfjsLib;
  } catch (error) {
    console.error('加载PDF.js失败:', error);
    throw new Error('PDF.js库加载失败，请确保已安装pdfjs-dist依赖');
  }
}

