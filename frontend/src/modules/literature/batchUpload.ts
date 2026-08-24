import { useState } from 'react';
import { getErrorMessage, uploadPaper } from '../../api/client';
import type { Paper } from '../../types';

export interface BatchItem {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  message?: string;
  paperId?: number;
}

/**
 * PDF 批量上传（导入文件夹 / 表格拖拽共用）：
 * 逐条上传，单条失败跳过并记录，不整批回滚。
 */
export function usePdfBatchUpload(onCreated?: (paper: Paper) => void) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);

  async function start(files: File[]) {
    const pdfs = files.filter(
      (file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    );
    if (pdfs.length === 0 || running) return;
    const next: BatchItem[] = pdfs.map((file) => ({ file, status: 'pending' }));
    setItems(next);
    setRunning(true);
    for (let index = 0; index < next.length; index += 1) {
      setItems((old) => old.map((item, i) => (i === index ? { ...item, status: 'uploading' } : item)));
      try {
        const paper = await uploadPaper(next[index].file);
        setItems((old) => old.map((item, i) => (i === index ? { ...item, status: 'done', paperId: paper.id } : item)));
        onCreated?.(paper);
      } catch (err) {
        setItems((old) =>
          old.map((item, i) => (i === index ? { ...item, status: 'error', message: getErrorMessage(err) } : item))
        );
      }
    }
    setRunning(false);
  }

  function clear() {
    setItems([]);
  }

  return { items, running, start, clear };
}
