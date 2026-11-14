'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { UserPlus, Users, CheckCircle, Trash2, Edit, CircleQuestionMark, ChevronDown, ChevronUp } from 'lucide-react';
import { Contact, Recipient, ROLES } from '@/types/types';
import toast from 'react-hot-toast';
import DropdownPortal from '../DropdownPortal';
import { Input } from '@ui';
import { Button } from '@ui';
import { Modal } from '@ui';
import { validateEmail } from '@/utils/utils';
import CreatableSelect from 'react-select/creatable';
import {
  components as reactSelectComponents,
  type GroupBase,
  type SelectComponentsConfig,
  type StylesConfig,
} from 'react-select';
import useContextStore from '@/hooks/useContextStore';
import { fetchWorkspaceTeams } from '@/lib/workspace-directory-client';
import { Select } from '@ui';
import {
  addTeamMembersToRecipients,
  createDraftRecipient,
  generateUniqueRecipientName,
} from '@/lib/recipient-draft-utils';

interface AddRecipientModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: Recipient[];
  onRecipientsChange: (recipients: Recipient[]) => void;
  isTemplateRoleMode?: boolean;
}

type TeamOption = {
  id: string;
  name: string;
  memberCount: number;
  members?: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }>;
};
type ContactOption = { value: string; label: string; contact?: Contact };

const contactSelectComponents: SelectComponentsConfig<ContactOption, false, GroupBase<ContactOption>> = {
  MenuPortal: (props) => (
    <reactSelectComponents.MenuPortal
      {...props}
      innerProps={
        {
          ...props.innerProps,
          'data-dropdown-portal': 'true',
        } as typeof props.innerProps & { 'data-dropdown-portal': string }
      }
    />
  ),
};

const AddRecipientModal: React.FC<AddRecipientModalProps> = ({
  isOpen,
  onClose,
  recipients,
  onRecipientsChange,
  isTemplateRoleMode = false,
}) => {
  const { user } = useContextStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [draftRecipients, setDraftRecipients] = useState<Recipient[]>([]);
  const [emailInputValues, setEmailInputValues] = useState<Record<string, string>>({});
  const skipEmailBlurCommitRef = useRef<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamRole, setTeamRole] = useState<Recipient['role']>('viewer');
  const [teamAsCc, setTeamAsCc] = useState(false);
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const canAddRecipientsFromTeam = !isTemplateRoleMode && Boolean(user?.orgId);

  const sortedRecipients = [...draftRecipients].sort((a, b) => {
    if (a.isCC === b.isCC) return a.order - b.order;
    return a.isCC ? 1 : -1; // CC goes to bottom
  });
  const normalRecipients = sortedRecipients.filter(r => !r.isCC);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const loadTeams = useCallback(async () => {
    const orgId = user?.orgId;
    if (!orgId) {
      setTeams([]);
      return;
    }
    setLoadingTeams(true);
    try {
      const payload = await fetchWorkspaceTeams(orgId);
      setTeams(payload.teams);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load teams';
      toast.error(message);
    } finally {
      setLoadingTeams(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (isOpen) {
      if (!isTemplateRoleMode) {
        void loadContacts();
        void loadTeams();
      } else {
        setContacts([]);
        setTeams([]);
      }
      const initialRecipients = recipients.length === 0
        ? [createDraftRecipient([], isTemplateRoleMode ? { name: 'Signer 1' } : undefined)]
        : recipients;
      setDraftRecipients(initialRecipients);
      setEmailInputValues({});
      setFormErrors({}); // Clear previous errors when modal opens
    }
  }, [isOpen, recipients, loadContacts, loadTeams, isTemplateRoleMode]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTeamId('');
      setTeamRole('viewer');
      setTeamAsCc(false);
      setShowTeamPanel(false);
    }
  }, [isOpen]);


  const validateForm = (recipientsToValidate = sortedRecipients) => {
    const errors: { [key: string]: string } = {};

    const processedRecipients = recipientsToValidate.map(r => ({
      ...r,
      email: r.email.trim(),
      name: r.name?.trim(),
    }));

    const emailCounts: { [key: string]: number } = {};
    processedRecipients.forEach(r => {
      if (r.email) {
        const lowerEmail = r.email.toLowerCase();
        emailCounts[lowerEmail] = (emailCounts[lowerEmail] || 0) + 1;
      }
    });

    const nameCounts: { [key: string]: number } = {};
    processedRecipients.forEach(r => {
      if (r.name) {
        const lowerName = r.name.toLowerCase();
        nameCounts[lowerName] = (nameCounts[lowerName] || 0) + 1;
      }
    });

    processedRecipients.forEach(r => {
      // Validate Email
      if (!isTemplateRoleMode && !r.email) {
        errors[`${r.id}_email`] = 'Email is required';
      } else if (r.email && !validateEmail(r.email)) {
        errors[`${r.id}_email`] = 'Invalid email format';
      } else if (r.email && emailCounts[r.email.toLowerCase()] > 1) {
        errors[`${r.id}_email`] = 'Duplicate email';
      }

      // Validate Name (Alias)
      if (!r.name) {
        errors[`${r.id}_name`] = isTemplateRoleMode ? 'Role label is required' : 'Alias is required';
      } else if (nameCounts[r.name.toLowerCase()] > 1) {
        errors[`${r.id}_name`] = isTemplateRoleMode ? 'Role labels must be unique' : 'Duplicate alias';
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const contactOptions: ContactOption[] = contacts.map(contact => ({
    value: contact.email.toLowerCase(),
    label: `${contact.firstName} ${contact.lastName}`.trim()
      ? `${contact.firstName} ${contact.lastName}`.trim() + ` ${contact.email}`
      : contact.email,
    contact,
  }));

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );
  const activeTeamMembers = useMemo(() => {
    if (!selectedTeam?.members) return [];
    return selectedTeam.members.filter((member) => member.status === 'active');
  }, [selectedTeam]);

  const menuPortalTarget = typeof window !== 'undefined' ? document.body : undefined;
  const teamRoleDropdownId = 'team-role-dropdown';

  const getRoleDefinition = (roleValue: Recipient['role']) => ROLES.find((role) => role.value === roleValue) ?? ROLES[0];

  const renderRoleDropdown = ({
    dropdownKey,
    targetId,
    value,
    onSelect,
    disabled = false,
    buttonClassName = 'min-w-[150px]',
    ariaLabel,
  }: {
    dropdownKey: string;
    targetId: string;
    value: Recipient['role'];
    onSelect: (value: Recipient['role']) => void;
    disabled?: boolean;
    buttonClassName?: string;
    ariaLabel: string;
  }) => {
    const roleDef = getRoleDefinition(value);
    const Icon = roleDef.icon;

    return (
      <div className="relative">
        <button
          id={targetId}
          type="button"
          onClick={() => {
            if (disabled) return;
            setShowRoleDropdown(showRoleDropdown === dropdownKey ? null : dropdownKey);
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={!disabled && showRoleDropdown === dropdownKey}
          className={`flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${buttonClassName}`}
        >
          <Icon className="h-4 w-4 shrink-0" style={{ color: disabled ? '#9CA3AF' : roleDef.color }} />
          <span>{roleDef.label}</span>
          <svg className="ml-auto h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {!disabled && showRoleDropdown === dropdownKey && (
          <DropdownPortal targetId={targetId} dropdown={showRoleDropdown} onClose={() => setShowRoleDropdown(null)}>
            <div className="w-64 rounded-md border border-gray-200 bg-white shadow-lg">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => {
                    onSelect(role.value);
                    setShowRoleDropdown(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <role.icon className="h-5 w-5" style={{ color: role.color }} />
                  <div>
                    <span className="text-sm">{role.label}</span>
                    <p className="text-xs text-gray-500">{role.description}</p>
                  </div>
                  {value === role.value && <CheckCircle className="ml-auto h-5 w-5 text-brand-600" />}
                </button>
              ))}
            </div>
          </DropdownPortal>
        )}
      </div>
    );
  };

  const getSelectStyles = (hasError: boolean): StylesConfig<ContactOption, false> => ({
    control: (base, state) => ({
      ...base,
      minHeight: '36px',
      borderColor: hasError ? '#EF4444' : state.isFocused ? '#3B82F6' : '#D1D5DB',
      boxShadow: state.isFocused ? '0 0 0 1px #3B82F6' : 'none',
      '&:hover': { borderColor: hasError ? '#EF4444' : state.isFocused ? '#3B82F6' : '#9CA3AF' },
    }),
    menuPortal: (base) => ({
      ...base,
      pointerEvents: 'auto',
      zIndex: 1000001,
    }),
  });

  const formatContactOptionLabel = (option: ContactOption) => {
    if (!option.contact) {
      return <span className="text-sm text-gray-900">{option.label}</span>;
    }
    const name = `${option.contact.firstName} ${option.contact.lastName}`.trim();
    return (
      <div className="flex flex-col">
        <span className="text-sm text-gray-900">{name || option.contact.email}</span>
        <span className="text-xs text-gray-500">{option.contact.email}</span>
      </div>
    );
  };

  const addRecipient = (isCC = false) => {
    setDraftRecipients((prev) => {
      const recipient = createDraftRecipient(prev, {
        isCC,
        ...(isTemplateRoleMode
          ? {
              name: generateUniqueRecipientName(
                `Signer ${prev.filter((item) => !item.isCC).length + 1}`,
                prev.map((item) => item.name)
              ),
            }
          : {}),
      });
      setEmailInputValues((current) => ({
        ...current,
        [recipient.id]: '',
      }));
      return [...prev, recipient];
    });
  };

  const handleAddTeamMembers = () => {
    if (!selectedTeam) {
      toast.error('Select a team to add');
      return;
    }
    if (activeTeamMembers.length === 0) {
      toast.error('No active members in this team');
      return;
    }

    setDraftRecipients(prev => {
      const { recipients: nextRecipients, added, skipped } = addTeamMembersToRecipients({
        recipients: prev,
        members: activeTeamMembers,
        role: teamRole,
        asCc: teamAsCc,
      });

      if (added > 0) {
        toast.success(`Added ${added} team member${added > 1 ? 's' : ''}${skipped ? `, skipped ${skipped}` : ''}.`);
      } else {
        toast.error('No new members were added.');
      }
      return nextRecipients;
    });
  };
  useEffect(() => {
    if (scrollContainerRef.current) {
      if (typeof scrollContainerRef.current.scrollTo === 'function') {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [sortedRecipients]);
  const removeRecipient = (id: string) => {
    setDraftRecipients(prev => prev.filter(r => r.id !== id).map((r, idx) => ({ ...r, order: idx + 1 })));
    setEmailInputValues((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTimeout(validateForm, 0); // Re-validate after state update
  };

  const updateRecipient = (id: string, updates: Partial<Recipient>) => {
    setDraftRecipients(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleAliasBlur = (id: string) => {
    setEditingAlias(null);
    const recipient = sortedRecipients.find(r => r.id === id);
    if (recipient) {
      const trimmedName = recipient?.name.trim();
      if (!trimmedName) {
        const existingNames = sortedRecipients.filter(r => r.id !== id).map(r => r.name);
        const defaultName = `${isTemplateRoleMode ? 'Signer' : 'Recipient'} ${recipient.order}`;
        updateRecipient(id, { name: generateUniqueRecipientName(defaultName, existingNames) });
      } else {
        updateRecipient(id, { name: trimmedName });
      }
    }
    setTimeout(validateForm, 0);
  };

  const handleEmailBlur = (id: string) => {
    if (skipEmailBlurCommitRef.current.delete(id)) {
      clearEmailInputValue(id);
      setTimeout(validateForm, 0);
      return;
    }

    const recipient = sortedRecipients.find(r => r.id === id);
    if (recipient) {
      const typedEmail = emailInputValues[id]?.trim();
      updateRecipient(id, {
        email:
          typedEmail && validateEmail(typedEmail)
            ? typedEmail
            : isTemplateRoleMode && !typedEmail
              ? ''
              : recipient.email.trim(),
      });
      if (typedEmail) {
        setEmailInputValues((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
    setTimeout(validateForm, 0);
  };

  const toggleAliasEdit = (id: string) => {
    setEditingAlias(editingAlias === id ? null : id);
    setTimeout(() => inputRefs.current[id]?.focus(), 0);
  };

  const selectContactForRecipient = (recipientId: string, contact: Contact) => {
    const recipient = sortedRecipients.find(r => r.id === recipientId);
    if (!recipient) return;

    // Clear validation error for email + name
    setFormErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${recipientId}_email`];
      delete newErrors[`${recipientId}_name`];
      return newErrors;
    });

    let nameToUpdate = recipient.name;
    const isDefaultOrEmptyName = /^Recipient\s\d+$/.test(recipient.name.trim()) || recipient.name.trim() === '';

    if (isDefaultOrEmptyName) {
      const contactName = `${contact.firstName} ${contact.lastName}`.trim();
      const existingNames = sortedRecipients.filter(r => r.id !== recipientId).map(r => r.name);
      nameToUpdate = generateUniqueRecipientName(contactName, existingNames);
    }

    updateRecipient(recipientId, { email: contact.email, name: nameToUpdate });

  };

  const clearEmailInputValue = (recipientId: string) => {
    setEmailInputValues((prev) => {
      if (!prev[recipientId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[recipientId];
      return next;
    });
  };


  const handleSaveAndContinue = () => {
    // Trim all fields before final validation
    const trimmedRecipients = sortedRecipients.map(r => ({
      ...r,
      email: r.email.trim(),
      name: r.name.trim(),
    }));
    setDraftRecipients(trimmedRecipients);

    if (!validateForm(trimmedRecipients)) {
      toast.error('Please fix the errors before continuing');
      return;
    }

    onRecipientsChange(trimmedRecipients);
    onClose();
    toast.success(
      isTemplateRoleMode
        ? `${trimmedRecipients.length} template role${trimmedRecipients.length > 1 ? 's' : ''} saved`
        : `${trimmedRecipients.length} recipient${trimmedRecipients.length > 1 ? 's' : ''} added successfully`
    );
  };

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen}
      onClose={onClose}
      handleConfirm={handleSaveAndContinue}
      confirmLabel={isTemplateRoleMode ? 'Save roles' : 'Save and Continue'}
      className='w-200'
      title={(
        <span className="text-xl font-semibold text-gray-900">
          {isTemplateRoleMode ? 'Template roles' : 'Add Recipients'} ({sortedRecipients.length})
        </span>
      )}
      description={
        isTemplateRoleMode
          ? 'Define reusable labels such as Client or Manager. Emails are optional and can be added when an agreement is created.'
          : 'You can edit this recipient list before sending the document.'
      }
    >
      {canAddRecipientsFromTeam && (
        <div className="px-4 pt-0">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-700">Add recipients from a team</h3>
                <p className="text-xs text-slate-500">
                  Keep manual email entry as the primary flow, or quickly add all active members from one team.
                </p>
              </div>
              <Button size="sm"
                type="button"
                inverted
                onClick={() => setShowTeamPanel((current) => !current)}
                className="shrink-0 border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                icon={showTeamPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              >
                {showTeamPanel ? 'Hide team picker' : 'Add from team'}
              </Button>
            </div>

            {showTeamPanel && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_120px_auto] md:items-end">
                  <div className="space-y-2">
                    <label htmlFor="team-recipient-select" className="text-sm text-gray-600">Team</label>
                    <Select
                      id="team-recipient-select"
                      className="w-full rounded border border-gray-300 px-3 py-2 bg-white"
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                    >
                      <option value="">Select a team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} · {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={teamRoleDropdownId} className="text-sm text-gray-600">Role</label>
                    {renderRoleDropdown({
                      dropdownKey: teamRoleDropdownId,
                      targetId: teamRoleDropdownId,
                      value: teamRole,
                      onSelect: (value) => setTeamRole(value),
                      disabled: teamAsCc,
                      buttonClassName: 'w-full',
                      ariaLabel: 'Team recipient permission',
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={teamAsCc}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTeamAsCc(checked);
                        if (checked && showRoleDropdown === teamRoleDropdownId) {
                          setShowRoleDropdown(null);
                        }
                      }}
                    />
                    Add as CC
                  </label>
                  <Button size="sm"
                    type="button"
                    onClick={handleAddTeamMembers}
                    disabled={loadingTeams || !selectedTeamId}
                  >
                    {loadingTeams ? 'Loading...' : 'Add team'}
                  </Button>
                </div>
                {showTeamPanel && !loadingTeams && teams.length === 0 && (
                  <p className="mt-3 text-xs text-slate-500">No teams yet. Create one in My Teams first.</p>
                )}
                {selectedTeamId && activeTeamMembers.length === 0 && (
                  <p className="mt-3 text-xs text-slate-500">No active members in this team.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={scrollContainerRef}>
        {sortedRecipients.map((recipient) => {
          const hasNameError = !!formErrors[`${recipient.id}_name`];
          const hasEmailError = !!formErrors[`${recipient.id}_email`];

          return (
            <div className={`flex gap-4 p-4 border-b border-gray-100 rounded-md ${recipient.isCC ? 'bg-gray-100' : ''}`} key={recipient.id}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white mt-8"
                style={{ backgroundColor: recipient.color }}
              >
                {recipient.name ? recipient.name.charAt(0).toUpperCase() : 'R'}
              </div>

              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  {isTemplateRoleMode ? (
                    <div className="flex-1">
                      <label
                        htmlFor={`role-label-${recipient.id}`}
                        className="mb-1 block text-xs font-medium text-gray-700"
                      >
                        Role label <span aria-hidden="true" className="text-red-500">*</span>
                      </label>
                      <Input
                        id={`role-label-${recipient.id}`}
                        type="text"
                        value={recipient.name}
                        onChange={e => updateRecipient(recipient.id, { name: e.target.value })}
                        onBlur={() => handleAliasBlur(recipient.id)}
                        aria-invalid={hasNameError}
                        aria-describedby={hasNameError ? `role-label-error-${recipient.id}` : undefined}
                        placeholder="For example, Client"
                        className={`w-full border px-2 py-1 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 ${hasNameError ? 'border-red-500' : 'border-gray-300'}`}
                      />
                    </div>
                  ) : editingAlias === recipient.id ? (
                    <Input
                      ref={el => { inputRefs.current[recipient.id] = el; }}
                      id={`recipient-alias-${recipient.id}`}
                      aria-label={`Recipient alias for ${recipient.name || `recipient ${recipient.order}`}`}
                      aria-invalid={hasNameError}
                      aria-describedby={hasNameError ? `recipient-alias-error-${recipient.id}` : undefined}
                      type="text"
                      value={recipient.name}
                      onChange={e => updateRecipient(recipient.id, { name: e.target.value })}
                      onBlur={() => handleAliasBlur(recipient.id)}
                      onKeyDown={e => e.key === 'Enter' && handleAliasBlur(recipient.id)}
                      className={` border px-2 py-1 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 ${hasNameError ? 'border-red-500' : 'border-gray-300'}`}
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900 flex gap-1 items-center" title='This person will receive a notification once is complete'>{recipient.isCC && 'CC'} {recipient.name}  {recipient.isCC && <CircleQuestionMark size={14} />} </span>
                  )}
                  {!isTemplateRoleMode && (
                    <button
                      type="button"
                      onClick={() => toggleAliasEdit(recipient.id)}
                      aria-label={`Edit alias for ${recipient.name || `recipient ${recipient.order}`}`}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Edit aria-hidden="true" className="w-4 h-4" />
                    </button>
                  )}
                  {hasNameError && (
                    <span
                      id={`${isTemplateRoleMode ? 'role-label' : 'recipient-alias'}-error-${recipient.id}`}
                      role="alert"
                      className="text-red-500 text-xs"
                    >
                      {formErrors[`${recipient.id}_name`]}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    {isTemplateRoleMode ? (
                      <div>
                        <label
                          htmlFor={`role-email-${recipient.id}`}
                          className="mb-1 block text-xs font-medium text-gray-700"
                        >
                          Default email <span className="font-normal text-gray-500">(optional)</span>
                        </label>
                        <Input
                          id={`role-email-${recipient.id}`}
                          type="email"
                          value={recipient.email}
                          onChange={e => updateRecipient(recipient.id, { email: e.target.value })}
                          onBlur={() => {
                            updateRecipient(recipient.id, { email: recipient.email.trim() });
                            setTimeout(validateForm, 0);
                          }}
                          aria-invalid={hasEmailError}
                          aria-describedby={`role-email-help-${recipient.id}${hasEmailError ? ` role-email-error-${recipient.id}` : ''}`}
                          placeholder="Assigned when creating an agreement"
                          className={`w-full border px-2 py-1 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 ${hasEmailError ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        <p id={`role-email-help-${recipient.id}`} className="mt-1 text-xs text-gray-500">
                          Leave blank to choose the person when creating an agreement.
                        </p>
                      </div>
                    ) : (
                      <>
                        <label id={`recipient-email-label-${recipient.id}`} className="sr-only">
                          Email address for {recipient.name || `recipient ${recipient.order}`}
                        </label>
                        <CreatableSelect<ContactOption, false>
                          instanceId={`contact-select-${recipient.id}`}
                          inputId={`recipient-email-${recipient.id}`}
                          aria-labelledby={`recipient-email-label-${recipient.id}`}
                          aria-invalid={hasEmailError}
                          classNamePrefix="recipient-contact-select"
                          components={contactSelectComponents}
                          isClearable
                          isSearchable
                          isLoading={loadingContacts}
                          placeholder="Select or type email"
                          options={contactOptions}
                          inputValue={emailInputValues[recipient.id] ?? ''}
                          formatOptionLabel={formatContactOptionLabel}
                          getOptionValue={(option) => option.value}
                          value={
                            recipient.email
                              ? contactOptions.find(option => option.value === recipient.email.toLowerCase())
                                ?? { value: recipient.email, label: recipient.email }
                              : null
                          }
                          onChange={(option) => {
                            skipEmailBlurCommitRef.current.add(recipient.id);
                            if (!option) {
                              updateRecipient(recipient.id, { email: '' });
                              clearEmailInputValue(recipient.id);
                              return;
                            }
                            if (option.contact) {
                              selectContactForRecipient(recipient.id, option.contact);
                              clearEmailInputValue(recipient.id);
                              return;
                            }
                            updateRecipient(recipient.id, { email: option.value });
                            clearEmailInputValue(recipient.id);
                          }}
                          onInputChange={(inputValue, actionMeta) => {
                            if (actionMeta.action === 'input-change') {
                              setEmailInputValues((prev) => ({
                                ...prev,
                                [recipient.id]: inputValue,
                              }));
                            }
                            return inputValue;
                          }}
                          onCreateOption={(inputValue) => {
                            skipEmailBlurCommitRef.current.add(recipient.id);
                            const email = inputValue.trim();
                            updateRecipient(recipient.id, { email });
                            clearEmailInputValue(recipient.id);
                          }}
                          onBlur={() => handleEmailBlur(recipient.id)}
                          formatCreateLabel={(inputValue) => `Use \"${inputValue}\"`}
                          isValidNewOption={(inputValue) => validateEmail(inputValue)}
                          noOptionsMessage={() => loadingContacts ? 'Loading...' : 'No contacts found'}
                          menuPortalTarget={menuPortalTarget}
                          menuPosition="fixed"
                          styles={getSelectStyles(hasEmailError)}
                        />
                      </>
                    )}
                  </div>
                  {!recipient.isCC && (
                    isTemplateRoleMode ? (
                      <div className="self-start">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Permissions</span>
                        {renderRoleDropdown({
                          dropdownKey: recipient.id,
                          targetId: `role-button-${recipient.id}`,
                          value: recipient.role,
                          onSelect: (value) => updateRecipient(recipient.id, { role: value }),
                          ariaLabel: `Permissions for ${recipient.name || `role ${recipient.order}`}`,
                        })}
                      </div>
                    ) : (
                      renderRoleDropdown({
                        dropdownKey: recipient.id,
                        targetId: `role-button-${recipient.id}`,
                        value: recipient.role,
                        onSelect: (value) => updateRecipient(recipient.id, { role: value }),
                        ariaLabel: `Recipient permission for ${recipient.name || `recipient ${recipient.order}`}`,
                      })
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => removeRecipient(recipient.id)}
                    disabled={normalRecipients.length === 1 && !recipient.isCC}
                    aria-label={`Remove ${isTemplateRoleMode ? 'role' : 'recipient'} ${recipient.name || recipient.order}`}
                    className={`p-2 text-gray-400 hover:text-red-600 ${normalRecipients.length === 1 && !recipient.isCC ? 'pointer-events-none opacity-50' : ''
                      }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                </div>
                {hasEmailError && (
                  <span
                    id={`${isTemplateRoleMode ? 'role-email' : 'recipient-email'}-error-${recipient.id}`}
                    role="alert"
                    className="text-red-500 text-xs pb-1"
                  >
                    {formErrors[`${recipient.id}_email`]}
                  </span>
                )}
              </div>
            </div>
          );
        })}

      </div>
      {/* Action Buttons */}
      <div className="flex items-center gap-4 absolute bottom-5">
        <Button
          onClick={() => addRecipient(false)}
          icon={<UserPlus size={16} />}
          inverted
          label={isTemplateRoleMode ? 'Add Role' : 'Add Recipient'}
          variant='outlineBrand'
          size='sm'
        />
        {!isTemplateRoleMode && !sortedRecipients.some(r => r.isCC) && (
          <Button
            onClick={() => addRecipient(true)}
            label='Add CC Recipients'
            inverted
            icon={<Users size={16} />}
           variant='outlineBrand'
           size='sm'
          />
        )}
      </div>
    </Modal>
  );
};

export default AddRecipientModal;
