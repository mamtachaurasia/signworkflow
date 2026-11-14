'use client';

import { UnknownAction, configureStore } from '@reduxjs/toolkit';
import { createContext, useState, type ReactNode } from 'react';
import {
  Provider,
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
  type ReactReduxContextValue,
  type TypedUseSelectorHook,
} from 'react-redux';

import builderReducer from './slices/builderSlice';
import {
  REDUX_DEV_CHECK_WARN_AFTER_MS,
  isSerializableReduxValue,
} from './serializable';

export function createBuilderStore() {
  return configureStore({
    reducer: {
      builder: builderReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: {
          warnAfter: REDUX_DEV_CHECK_WARN_AFTER_MS,
        },
        serializableCheck: {
          isSerializable: isSerializableReduxValue,
          warnAfter: REDUX_DEV_CHECK_WARN_AFTER_MS,
          ignoredPaths: [
            'builder.replacePageRequest.initialSourceFile',
            'builder.appendDocumentRequest.initialSourceFile',
          ],
        },
      }),
  });
}

export type BuilderStore = ReturnType<typeof createBuilderStore>;
export type BuilderRootState = ReturnType<BuilderStore['getState']>;
export type BuilderDispatch = BuilderStore['dispatch'];

const BuilderReduxContext = createContext<ReactReduxContextValue<
  BuilderRootState,
  UnknownAction
> | null>(null);

const useBuilderDispatchBase = createDispatchHook(BuilderReduxContext);
const useBuilderSelectorBase = createSelectorHook(BuilderReduxContext);
const useBuilderStoreBase = createStoreHook(BuilderReduxContext);

export const useBuilderDispatch = () => useBuilderDispatchBase<BuilderDispatch>();
export const useBuilderSelector: TypedUseSelectorHook<BuilderRootState> = useBuilderSelectorBase;
export const useBuilderReduxStore = () => useBuilderStoreBase() as BuilderStore;

export function BuilderStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createBuilderStore);

  return (
    <Provider context={BuilderReduxContext} store={store}>
      {children}
    </Provider>
  );
}
