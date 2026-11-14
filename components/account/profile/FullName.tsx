import { Button, SaveButton } from '@ui';
import { Input } from '@ui';
import { User } from "@/types/types";
import { useState } from "react";

export default function FullName({
  label,
  isSaving,
  user,
  setUser,
  handleSave,
}: {
  label: string;
  isSaving: boolean;
  user: User;
  setUser: (user: User) => void;
  handleSave: (updatedUser: Partial<User>) => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
  });
  const hasChanges = draft.firstName !== (user.firstName || '') || draft.lastName !== (user.lastName || '');
  const onSave = async () => {
    if (!hasChanges) {
      setIsEditing(false); // cancel if no changes
      return;
    }
    setUser({
      ...user,
      firstName: draft.firstName,
      lastName: draft.lastName,
    });

    await handleSave({
      firstName: draft.firstName,
      lastName: draft.lastName,
    }); // API call
    setIsEditing(false);
  };
  const onCancel = () => {
    setIsEditing(false);
    setDraft({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  };
  const startEditing = () => {
    setDraft({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
    setIsEditing(true);
  };
  return (
    <>
      <div className="py-4 border-b last:border-none">
        <div className="flex flex-col gap-3 sm:flex-row items-end sm:justify-between">
          <div className="flex-1 min-w-0">
            {!isEditing && (
              <>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="font-medium">
                  {user?.firstName || user?.lastName
                    ? `${user.firstName} ${user.lastName}`.trim()
                    : 'Not added'}
                </p>
              </>
            )}

            {isEditing && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Input
                    id="profile-first-name"
                    type="text"
                    value={draft.firstName}
                    onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                    label="First Name"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Input
                    id="profile-last-name"
                    type="text"
                    label="Last Name"
                    value={draft.lastName}
                    onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                    required
                  />
                </div>
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
                onClick={startEditing}
                inverted
                className="h-9 px-3 text-xs"
                label="Change"
              />
            )}
          </div>
        </div>
      </div>

      <p className="mt-1 text-xs text-slate-400">Used as the sender name in invite emails</p>
    </>
  );
}
