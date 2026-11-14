'use client';

import { useEffect } from 'react';

import { clearDashboardDocumentCache } from '@/lib/dashboard-document-cache';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { resetSession, setIsLoggedIn, setUser } from '@/store/slices/sessionSlice';
import type { User } from '@/types/types';

import { useAuth } from './AuthProvider';

function hasAuthUserChanged(currentUser: User | null, nextUser: User): boolean {
  if (!currentUser) {
    return true;
  }

  return (
    currentUser.id !== nextUser.id ||
    currentUser.email !== nextUser.email ||
    currentUser.role !== nextUser.role ||
    currentUser.orgId !== nextUser.orgId ||
    currentUser.orgRole !== nextUser.orgRole ||
    currentUser.primaryOrgId !== nextUser.primaryOrgId ||
    currentUser.orgPlan !== nextUser.orgPlan ||
    currentUser.workspaceTier !== nextUser.workspaceTier ||
    currentUser.firstName !== nextUser.firstName ||
    currentUser.lastName !== nextUser.lastName ||
    currentUser.name !== nextUser.name ||
    currentUser.picture !== nextUser.picture
  );
}

export default function AuthStateBridge() {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((state) => state.session.user);
  const isLoggedIn = useAppSelector((state) => state.session.isLoggedIn);
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAuthenticated && user) {
      const nextUser: User =
        currentUser?.id === user.id
          ? {
              ...currentUser,
              ...user,
            }
          : {
              ...user,
            };

      const accountScopeChanged = Boolean(
        currentUser &&
          (currentUser.id !== nextUser.id ||
            (currentUser.orgId ?? null) !== (nextUser.orgId ?? null)),
      );
      if (accountScopeChanged) {
        clearDashboardDocumentCache();
        dispatch(resetSession());
      }

      if (!isLoggedIn || accountScopeChanged) {
        dispatch(setIsLoggedIn(true));
      }

      if (hasAuthUserChanged(currentUser, nextUser)) {
        dispatch(setUser(nextUser));
      }
      return;
    }

    if (isLoggedIn || currentUser !== null) {
      clearDashboardDocumentCache();
      dispatch(resetSession());
    }
  }, [currentUser, dispatch, isAuthenticated, isLoading, isLoggedIn, user]);

  return null;
}
