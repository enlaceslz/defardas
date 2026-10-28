import { useRef, useState } from 'react';
export function useSubmission() {
  const pending = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const submit = async (operation: () => Promise<boolean>): Promise<boolean> => {
    if (pending.current) return false;
    pending.current = true; setIsSaving(true);
    try { return await operation(); }
    catch (error) { alert(error instanceof Error ? error.message : 'A operação não foi confirmada.'); return false; }
    finally { pending.current = false; setIsSaving(false); }
  };
  return { submit, isSaving };
}
