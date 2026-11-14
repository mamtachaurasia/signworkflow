import type React from 'react';
import type { PayloadActionCreator, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

export function resolveStateUpdate<T>(
  current: T,
  update: React.SetStateAction<T>,
): T {
  return typeof update === 'function'
    ? (update as (prevState: T) => T)(current)
    : update;
}

type StateUpdateDispatch<State> = ThunkDispatch<State, unknown, UnknownAction>;

export function dispatchStateUpdate<State, T>(
  dispatch: StateUpdateDispatch<State>,
  selectState: (state: State) => T,
  actionCreator: PayloadActionCreator<T>,
  update: React.SetStateAction<T>,
) {
  if (typeof update === 'function') {
    dispatch((innerDispatch, getState) => {
      const nextValue = resolveStateUpdate(
        selectState(getState()),
        update,
      );
      innerDispatch(actionCreator(nextValue));
    });
    return;
  }

  dispatch(actionCreator(update));
}
