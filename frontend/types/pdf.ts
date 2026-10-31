export interface PDFAnnotation {
  id: string;
  pageNum: number;
  type: 'text' | 'redact';
  xRatio: number; // 0 to 1
  yRatio: number; // 0 to 1
  widthRatio?: number; // 0 to 1
  heightRatio?: number; // 0 to 1
  text?: string;
  fontSize?: number;
  color?: string; // 'black' | 'red' | 'blue' | 'white'
  redactStyle?: 'black' | 'white';
}

