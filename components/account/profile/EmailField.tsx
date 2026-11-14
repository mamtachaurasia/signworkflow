import { useState } from 'react';
import { Input } from '@ui';
import { Button, SaveButton } from '@ui';
import { User } from '@/types/types';
import { validateEmail } from '@/utils/utils';

interface EmailFieldProps {
  user: User;
  isSaving: boolean;
  handleSave: (updated: Partial<User>) => Promise<void>;
}

export default function EmailField({ user, isSaving, handleSave }: EmailFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(user.email || '');
  const [error, setError] = useState<string | null>(null);

  const hasChanges = draft !== (user.email || '');

  const onCancel = () => {
    setDraft(user.email || '');
    setIsEditing(false);
    setError(null);
  };

  const onSave = async () => {
    if (!draft) {
      setError('Email is required');
      return;
    }
    if (! validateEmail(draft)) {
      setError('Enter a valid email address');
      return;
    }

    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    await handleSave({ email: draft });
    setIsEditing(false);
  };

  const onStartEdit = () => {
    setDraft(user.email || '');
    setError(null);
    setIsEditing(true);
  };

  return (
    <>
      <div className="py-4 border-b last:border-none">
        <div className="flex flex-col gap-3 sm:flex-row items-end sm:justify-between">
          <div className="flex-1 min-w-0">
            {!isEditing && (
              <>
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium">{user.email || 'Not added'}</p>
              </>
            )}

            {isEditing && (
              <div className="space-y-2">
                <Input
                  type="email"
                  value={draft}
                  label="Email"
                  onChange={(e) => setDraft(e.target.value)}
                  required
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <SaveButton
                  disabled={isSaving || !hasChanges}
                  className="h-9 px-3 text-xs"
                  label="Save changes"
                  saving={isSaving}
                  onClick={onSave}
                />
                <Button size="sm"
                  onClick={onCancel}
                  inverted
                  className="h-9 px-3 text-xs"
                  label="Cancel"
                />
              </>
            ) : (
              <Button size="sm"
                onClick={onStartEdit}
                inverted
                className="h-9 px-3 text-xs"
                label="Change"
              />
            )}
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">Used for account login and notifications</p>
    </>
  );
}
