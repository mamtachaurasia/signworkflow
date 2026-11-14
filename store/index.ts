import { combineReducers, configureStore } from '@reduxjs/toolkit';

import contactsReducer from './slices/contactsSlice';
import documentsReducer from './slices/documentsSlice';
import sessionReducer from './slices/sessionSlice';
import templatesReducer from './slices/templatesSlice';
import uiReducer from './slices/uiSlice';
import { resetSession } from './slices/sessionSlice';
import {
  REDUX_DEV_CHECK_WARN_AFTER_MS,
  isSerializableReduxValue,
} from './serializable';

const combinedReducer = combineReducers({
  contacts: contactsReducer,
  documents: documentsReducer,
  session: sessionReducer,
  templates: templatesReducer,
  ui: uiReducer,
});

const rootReducer: typeof combinedReducer = (state, action) => {
  if (!resetSession.match(action)) return combinedReducer(state, action);

  const resetState = combinedReducer(undefined, action);
  return {
    ...resetState,
    ui: state?.ui ?? resetState.ui,
  };
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: {
        warnAfter: REDUX_DEV_CHECK_WARN_AFTER_MS,
      },
      serializableCheck: {
        isSerializable: isSerializableReduxValue,
        warnAfter: REDUX_DEV_CHECK_WARN_AFTER_MS,
        ignoredPaths: [
          'documents.selectedFile',
          'documents.items',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
