import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); dialog.querySelector<HTMLInputElement>('input:not([type=checkbox]):not([type=radio])')?.focus(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="app-dialog" aria-label={title} onCancel={close}><header className="dialog-heading"><h2>{title}</h2><button type="button" onClick={close} aria-label="关闭窗口">×</button></header>{children}</dialog>;
}
