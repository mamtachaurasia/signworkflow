import { useCallback, useEffect, useRef } from 'react';
import { DroppedComponent } from '@/types/types';
import {
  deletePageComponents,
  duplicatePageComponents,
  insertBlankPageComponents,
  insertPagesWithComponents,
  movePageComponents,
  type InsertPagesOperation,
  type MovePageOperation,
  replacePageWithComponents,
  type ReplacePageOperation,
  type PageStructureOperation,
} from '@/utils/builder/pageOperations';

interface UsePageOperationsProps {
  droppedComponents: DroppedComponent[];
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  resetHistory: (nextState: DroppedComponent[]) => void;
  insertBlankPageAt: (index: number) => Promise<boolean>;
}

export const usePageOperations = ({
  droppedComponents,
  setDroppedComponents,
  resetHistory,
  insertBlankPageAt,
}: UsePageOperationsProps) => {
  const droppedComponentsRef = useRef(droppedComponents);

  useEffect(() => {
    droppedComponentsRef.current = droppedComponents;
  }, [droppedComponents]);

  const commitPageOperation = useCallback((nextState: DroppedComponent[]) => {
    setDroppedComponents(nextState);
    resetHistory(nextState);
  }, [resetHistory, setDroppedComponents]);

  const handleInsertBlankPage = useCallback(async (pageNum: number) => {
    const inserted = await insertBlankPageAt(pageNum);
    if (!inserted) {
      return false;
    }

    const nextState = insertBlankPageComponents(droppedComponentsRef.current, pageNum);
    commitPageOperation(nextState);
    return true;
  }, [commitPageOperation, insertBlankPageAt]);

  const handlePageDeleted = useCallback((operation: PageStructureOperation) => {
    const nextState = deletePageComponents(droppedComponentsRef.current, operation);
    commitPageOperation(nextState);
  }, [commitPageOperation]);

  const handlePageDuplicated = useCallback((operation: PageStructureOperation) => {
    const nextState = duplicatePageComponents(droppedComponentsRef.current, operation);
    commitPageOperation(nextState);
  }, [commitPageOperation]);

  const handlePageMoved = useCallback((operation: MovePageOperation) => {
    const nextState = movePageComponents(droppedComponentsRef.current, operation);
    commitPageOperation(nextState);
  }, [commitPageOperation]);

  const handlePagesInserted = useCallback((
    operation: InsertPagesOperation,
    insertedComponents: DroppedComponent[] = []
  ) => {
    const nextState = insertPagesWithComponents(
      droppedComponentsRef.current,
      operation,
      insertedComponents
    );
    commitPageOperation(nextState);
  }, [commitPageOperation]);

  const handlePageReplaced = useCallback((
    operation: ReplacePageOperation,
    replacementComponents: DroppedComponent[] = []
  ) => {
    const nextState = replacePageWithComponents(
      droppedComponentsRef.current,
      operation,
      replacementComponents
    );
    commitPageOperation(nextState);
  }, [commitPageOperation]);

  return {
    handleInsertBlankPage,
    handlePageDeleted,
    handlePageDuplicated,
    handlePageMoved,
    handlePagesInserted,
    handlePageReplaced,
  };
};
