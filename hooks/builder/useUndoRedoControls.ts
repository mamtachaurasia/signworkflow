"use client";
import { useCallback, useEffect } from 'react';
import { DroppedComponent } from '@/types/types';
import { useUndoRedo } from '@/hooks/builder/useUndoRedo';

export const useUndoRedoControls = (
  initialState: DroppedComponent[],
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
  disabled = false
) => {
  const { saveState, undo, redo, canUndo, canRedo, resetHistory } = useUndoRedo(initialState);

  const handleUndo = useCallback((): void => {
    if (disabled) return;
    const previousState = undo();
    if (previousState) {
      setDroppedComponents(previousState);
    }
  }, [disabled, undo, setDroppedComponents]);

  const handleRedo = useCallback((): void => {
    if (disabled) return;
    const nextState = redo();
    if (nextState) {
      setDroppedComponents(nextState);
    }
  }, [disabled, redo, setDroppedComponents]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, handleUndo, handleRedo]);

  return {
    saveState,
    canUndo: !disabled && canUndo,
    canRedo: !disabled && canRedo,
    resetHistory,
    handleUndo,
    handleRedo,
  };
};
