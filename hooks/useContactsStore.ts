'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';

import type { Contact } from '@/types/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  addContact as addContactAction,
  setContacts as setContactsAction,
  setContactsError,
  setContactsLoading,
  updateContact as updateContactAction,
} from '@/store/slices/contactsSlice';

const CONTACTS_CACHE_TTL_MS = 60_000;
const contactsRefreshTimes = new Map<string, number>();
const contactsRequests = new Map<string, Promise<Contact[]>>();
let contactsStateScopeKey: string | null = null;

export const useContactsStore = () => {
  const dispatch = useAppDispatch();
  const contacts = useAppSelector((state) => state.contacts.items);
  const loading = useAppSelector((state) => state.contacts.loading);
  const error = useAppSelector((state) => state.contacts.error);
  const user = useAppSelector((state) => state.session.user);
  const contactsScopeKey = user?.id
    ? `${user.id}:${user.orgId ?? 'personal'}`
    : null;
  const activeScopeRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    activeScopeRef.current = contactsScopeKey;
    return () => {
      if (activeScopeRef.current === contactsScopeKey) {
        activeScopeRef.current = null;
      }
    };
  }, [contactsScopeKey]);

  const fetchContacts = useCallback(async (options?: { force?: boolean }) => {
    if (!contactsScopeKey) return;

    const requestScopeKey = contactsScopeKey;
    const refreshedAt = contactsRefreshTimes.get(requestScopeKey) ?? 0;
    if (!options?.force && Date.now() - refreshedAt < CONTACTS_CACHE_TTL_MS) {
      return;
    }

    let request = contactsRequests.get(requestScopeKey);
    try {
      if (refreshedAt === 0) dispatch(setContactsLoading(true));
      dispatch(setContactsError(null));
      if (!request) {
        request = fetch('/api/contacts').then(async (response) => {
          if (response.status === 401) return [];
          if (!response.ok) throw new Error('Failed to fetch contacts');

          const data = await response.json();
          return Array.isArray(data.contacts) ? data.contacts : [];
        });
        contactsRequests.set(requestScopeKey, request);
      }

      const nextContacts = await request;
      if (
        activeScopeRef.current !== requestScopeKey ||
        contactsStateScopeKey !== requestScopeKey
      ) {
        return;
      }

      contactsRefreshTimes.set(requestScopeKey, Date.now());
      dispatch(setContactsAction(nextContacts));
    } catch (err) {
      if (
        activeScopeRef.current !== requestScopeKey ||
        contactsStateScopeKey !== requestScopeKey
      ) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to load contacts';
      dispatch(setContactsError(errorMessage));
      toast.error(errorMessage);
    } finally {
      if (request && contactsRequests.get(requestScopeKey) === request) {
        contactsRequests.delete(requestScopeKey);
      }
      if (
        activeScopeRef.current === requestScopeKey &&
        contactsStateScopeKey === requestScopeKey
      ) {
        dispatch(setContactsLoading(false));
      }
    }
  }, [contactsScopeKey, dispatch]);

  const contactsForScope = useMemo(
    () => contactsScopeKey && contactsStateScopeKey === contactsScopeKey ? contacts : [],
    [contacts, contactsScopeKey],
  );
  const loadingForScope = Boolean(contactsScopeKey) &&
    (contactsStateScopeKey !== contactsScopeKey || loading);
  const errorForScope =
    contactsScopeKey && contactsStateScopeKey === contactsScopeKey ? error : null;

  const addContact = useCallback(
    (contact: Contact) => {
      if (!contactsScopeKey || activeScopeRef.current !== contactsScopeKey) return;
      dispatch(addContactAction(contact));
    },
    [contactsScopeKey, dispatch],
  );

  const updateContact = useCallback(
    (updatedContact: Contact) => {
      if (!contactsScopeKey || activeScopeRef.current !== contactsScopeKey) return;
      dispatch(updateContactAction(updatedContact));
    },
    [contactsScopeKey, dispatch],
  );

  const deleteContact = useCallback(
    async (contactId: string) => {
      if (!contactsScopeKey) return;

      const operationScopeKey = contactsScopeKey;
      const originalContacts = contactsForScope;
      try {
        dispatch(
          setContactsAction(
            contactsForScope.filter((contact) => contact._id !== contactId),
          ),
        );

        const response = await fetch(`/api/contacts/${contactId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete contact');
        }

        if (
          activeScopeRef.current === operationScopeKey &&
          contactsStateScopeKey === operationScopeKey
        ) {
          toast.success('Contact deleted successfully');
        }
      } catch (err) {
        if (
          activeScopeRef.current !== operationScopeKey ||
          contactsStateScopeKey !== operationScopeKey
        ) {
          return;
        }
        toast.error(err instanceof Error ? err.message : 'An unknown error occurred');
        dispatch(setContactsAction(originalContacts));
      }
    },
    [contactsForScope, contactsScopeKey, dispatch],
  );

  const deleteContacts = useCallback(
    async (contactIds: string[]) => {
      if (!contactsScopeKey) return;

      const operationScopeKey = contactsScopeKey;
      const originalContacts = contactsForScope;
      try {
        dispatch(
          setContactsAction(
            contactsForScope.filter(
              (contact) => contact._id && !contactIds.includes(contact._id),
            ),
          ),
        );

        const response = await fetch('/api/contacts/bulk-delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ contactIds }),
        });

        if (!response.ok) {
          throw new Error('Failed to delete contacts');
        }

        if (
          activeScopeRef.current === operationScopeKey &&
          contactsStateScopeKey === operationScopeKey
        ) {
          toast.success('Contacts deleted successfully');
        }
      } catch (err) {
        if (
          activeScopeRef.current !== operationScopeKey ||
          contactsStateScopeKey !== operationScopeKey
        ) {
          return;
        }
        toast.error(err instanceof Error ? err.message : 'An unknown error occurred');
        dispatch(setContactsAction(originalContacts));
      }
    },
    [contactsForScope, contactsScopeKey, dispatch],
  );

  const revalidateContacts = useCallback(async () => {
    await fetchContacts({ force: true });
  }, [fetchContacts]);

  useEffect(() => {
    if (!contactsScopeKey) {
      contactsStateScopeKey = null;
      dispatch(setContactsAction([]));
      dispatch(setContactsError(null));
      dispatch(setContactsLoading(false));
      return;
    }

    const scopeChanged = contactsStateScopeKey !== contactsScopeKey;
    if (scopeChanged) {
      contactsStateScopeKey = contactsScopeKey;
      contactsRefreshTimes.delete(contactsScopeKey);
      dispatch(setContactsAction([]));
      dispatch(setContactsError(null));
    }
    void fetchContacts({ force: scopeChanged });
  }, [contactsScopeKey, dispatch, fetchContacts]);

  return {
    contacts: contactsForScope,
    loading: loadingForScope,
    error: errorForScope,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact,
    deleteContacts,
    revalidateContacts,
  };
};
