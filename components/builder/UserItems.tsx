"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { Modal } from '@ui';
import { Button } from '@ui';
import SignatureCanvas from "react-signature-canvas";
import { Type, ArrowLeft, PlusCircle, LineSquiggle, Signature } from "lucide-react";
import useContextStore from "@/hooks/useContextStore";
import { Input } from '@ui';
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import { DroppingField, ItemType, SignatureInitial, User } from "@/types/types";
import Image from "next/image";

/* ================= Types ================= */

type Screen = "select" | "create";
type CreateMode = "typed" | "drawn";

interface UserItemsProps {
  onClose: () => void;
  onAdd: (initial: SignatureInitial) => void;
  component?: DroppingField | null;
  type?: ItemType;
}

interface SelectScreenProps {
  items: SignatureInitial[];
  selectedId: string | null;
  isSignature: boolean;
  isStamp: boolean;
  isSaving: boolean;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  onMakeDefault: (item: SignatureInitial) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

interface CreateScreenProps {
  isSignature: boolean;
  isStamp: boolean;
  createMode: CreateMode;
  typedValue: string;
  makeDefault: boolean;
  isSaving: boolean;
  canvasRef: React.RefObject<SignatureCanvas | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setCreateMode: (m: CreateMode) => void;
  setTypedValue: (v: string) => void;
  setDrawnValue: (v: string | null) => void;
  setMakeDefault: (v: boolean) => void;
  onCanvasEnd: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
}

interface ProfilePatchResponse {
  user?: User;
}

const normalizeStoredItems = (items: SignatureInitial[]): SignatureInitial[] => {
  let defaultFound = false;
  return items.map((item, index) => {
    const isDefault = Boolean(item.isDefault) && !defaultFound;
    if (isDefault) {
      defaultFound = true;
    }
    const fallbackId =
      typeof item.id === "string" && item.id.trim().length > 0
        ? item.id
        : `legacy-${item.type}-${index}-${item.value.slice(0, 12)}`;
    return { ...item, id: fallbackId, isDefault };
  });
};

const normalizeItemsForSave = (items: SignatureInitial[]): SignatureInitial[] => {
  let defaultFound = false;
  const normalized = items.map((item) => {
    const isDefault = Boolean(item.isDefault) && !defaultFound;
    if (isDefault) defaultFound = true;
    return { ...item, isDefault };
  });

  if (!defaultFound && normalized.length > 0) {
    return normalized.map((item, index) => ({ ...item, isDefault: index === 0 }));
  }

  return normalized;
};

/* ================= Main Component ================= */

const UserItems: React.FC<UserItemsProps> = ({
  onClose,
  onAdd,
  component,
  type,
}) => {
  const { user, setUser } = useContextStore();

  const canvasRef = useRef<SignatureCanvas>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [screen, setScreen] = useState<Screen>("select");
  const [createMode, setCreateMode] = useState<CreateMode>("typed");
  const [typedValue, setTypedValue] = useState("");
  const [drawnValue, setDrawnValue] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine type from prop or component
  const effectiveType = type || 
    (component?.component === "Signature" ? "Signature" : 
     component?.component === "Stamp" ? "Stamp" : 
     "Initials");

  const isSignature = effectiveType === "Signature";
  const isStamp = effectiveType === "Stamp";
  const isInitial = effectiveType === "Initials";
  const itemCollectionKey: "initials" | "signatures" | "stamps" = isInitial
    ? "initials"
    : isStamp
      ? "stamps"
      : "signatures";
  const userName = user?.name ?? "";

  /* ================= Derived ================= */

  const defaultInitial = useMemo(() => {
    if (!userName) return "";
    return userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("");
  }, [userName]);

  const userDefaults = useMemo<SignatureInitial[]>(() => {
    if (!user) return [];
    const sourceItems = user[itemCollectionKey] || [];
    const normalized = normalizeStoredItems(sourceItems);
    if (normalized.length === 0 && isInitial) {
      return [
        {
          id: "initials-fallback",
          value: defaultInitial,
          type: "typed",
          isDefault: true,
        },
      ];
    }
    return normalized;
  }, [defaultInitial, isInitial, itemCollectionKey, user]);

  const effectiveSelectedId = (() => {
    if (selectedId && userDefaults.some((item) => item.id === selectedId)) {
      return selectedId;
    }
    if (component?.data) {
      const matched = userDefaults.find((item) => item.value === component.data);
      if (matched) return matched.id;
    }
    return userDefaults[0]?.id ?? null;
  })();


  /* ================= Helpers ================= */

  const updateUserItems = async (
    items: SignatureInitial[]
  ) => {
    if (!user) throw new Error("User profile is still loading.");
    const normalizedItems = normalizeItemsForSave(items);
    const payload = { [itemCollectionKey]: normalizedItems };

    const res = await api.patch<ProfilePatchResponse>("/user/profile", payload);
    if (!res.user) {
      throw new Error("Profile update did not return the saved user.");
    }
    setUser(res.user);
    return res.user;
  };

  const persistUserItems = async (
    items: SignatureInitial[]
  ) => {
    setIsSaving(true);
    setError(null);
    try {
      return await updateUserItems(items);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save. Please try again.");
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCanvasEnd = () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return;
    setDrawnValue(canvasRef.current.getTrimmedCanvas().toDataURL("image/png"));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      void (async () => {
        const shouldMakeDefault = makeDefault || userDefaults.length === 0;
        const newItem: SignatureInitial = {
          id: uuidv4(),
          value: reader.result as string,
          type: "drawn",
          isDefault: shouldMakeDefault,
        };

        const updated = [
          ...userDefaults.map((item) => ({
            ...item,
            isDefault: shouldMakeDefault ? false : item.isDefault,
          })),
          newItem,
        ];

        await persistUserItems(updated);
        setSelectedId(newItem.id);
        setScreen("select");
        setMakeDefault(false);
      })().catch(() => {
        // Error state is handled by persistUserItems.
      });
    };
    reader.onerror = () => {
      setError("Unable to read the uploaded file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSelect = () => {
    const selected = userDefaults.find((i) => i.id === effectiveSelectedId);
    if (selected) {
      onAdd(selected);
      onClose();
    }
  };

  const handleAddNew = async () => {
    if (!typedValue && !drawnValue) return;
    const shouldMakeDefault = makeDefault || userDefaults.length === 0;

    const newItem: SignatureInitial = {
      id: uuidv4(),
      value: createMode === "typed" ? typedValue : drawnValue || "",
      type: createMode,
      isDefault: shouldMakeDefault,
    };

    const updated = [
      ...userDefaults.map((i) => ({ ...i, isDefault: shouldMakeDefault ? false : i.isDefault })),
      newItem,
    ];

    try {
      await persistUserItems(updated);
      setSelectedId(newItem.id);
      setScreen("select");
      setTypedValue("");
      setDrawnValue(null);
      setMakeDefault(false);
    } catch {
      // Error state is handled by persistUserItems.
    }
  };

  const handleMakeDefault = async (item: SignatureInitial) => {
    try {
      await persistUserItems(
        userDefaults.map((current) => ({ ...current, isDefault: current.id === item.id }))
      );
      setSelectedId(item.id);
    } catch {
      // Error state is handled by persistUserItems.
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await persistUserItems(
        userDefaults.filter((item) => item.id !== id)
      );
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch {
      // Error state is handled by persistUserItems.
    }
  };

  /* ================= Render ================= */

  if (!user) {
    return (
      <Modal visible title="Loading…" onClose={onClose}>
        <div className="p-6 text-center text-gray-600">Loading signer info…</div>
      </Modal>
    );
  }

  return (
    <Modal
      visible
      title={`Select your ${isSignature ? "Signature" : isStamp ? "Stamp" : "Initials"} or add a new one:`}
      onClose={onClose}
      handleCancel={onClose}
      handleConfirm={screen === "select" ? handleConfirmSelect : handleAddNew}
      className="w-175"
      confirmDisabled={isSaving || (screen === "create" && !typedValue && !drawnValue)}
      confirmLabel={screen === "select" ? `Use ${isSignature ? "Signature" : isStamp ? "Stamp" : "Initials"}` : `Add ${isSignature ? "Signature" : isStamp ? "Stamp" : "Initials"}`}
    >
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {screen === "select" ? (
        <SelectScreen
          items={userDefaults}
          selectedId={effectiveSelectedId}
          isSignature={isSignature}
          isStamp={isStamp}
          isSaving={isSaving}
          onSelect={setSelectedId}
          onAddNew={() => setScreen("create")}
          onMakeDefault={handleMakeDefault}
          onDelete={handleDelete}
        />
      ) : (
        <CreateScreen
          isSignature={isSignature}
          isStamp={isStamp}
          createMode={createMode}
          typedValue={typedValue}
          makeDefault={makeDefault}
          isSaving={isSaving}
          canvasRef={canvasRef}
          fileInputRef={fileInputRef}
          setCreateMode={setCreateMode}
          setTypedValue={setTypedValue}
          setDrawnValue={setDrawnValue}
          setMakeDefault={setMakeDefault}
          onCanvasEnd={handleCanvasEnd}
          onUpload={handleUpload}
          onBack={() => setScreen("select")}
        />
      )}
    </Modal>
  );
};

export default UserItems;

/* ================= Child Components ================= */

const SelectScreen: React.FC<SelectScreenProps> = ({
  items,
  selectedId,
  isSignature,
  isStamp,
  isSaving,
  onSelect,
  onAddNew,
  onMakeDefault,
  onDelete,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2 p-3 pt-0 overflow-auto max-h-87.5">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Button size="sm"
          onClick={onAddNew}
          disabled={isSaving}
          inverted
          icon={<PlusCircle className="mb-2 " />}
          label={`Add New ${isSignature ? "Signature" : isStamp ? "Stamp" : "Initials"}`}
          className="text-brand-600 flex-col gap-0 border-dashed border-brand-500 h-32 bg-brand-50"
        />

        {items.map((item) => (
          <Cards
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            isSignature={isSignature}
            isStamp={isStamp}
            isSaving={isSaving}
            isMenuOpen={openMenuId === item.id}
            menuRef={openMenuId === item.id ? menuRef : null}
            onSelect={() => {
              onSelect(item.id);
            }}
            onToggleMenu={() =>
              setOpenMenuId((prev) => (prev === item.id ? null : item.id))
            }
            onMakeDefault={() => {
              void onMakeDefault(item);
              setOpenMenuId(null);
            }}
            onDelete={() => {
              void onDelete(item.id);
              setOpenMenuId(null);
            }}
          />
        ))}
      </div>
    </div>
  );
};




const Cards = ({
  item,
  selected,
  isSignature,
  isStamp,
  isSaving,
  isMenuOpen,
  menuRef,
  onSelect,
  onToggleMenu,
  onMakeDefault,
  onDelete,
}: {
  item: SignatureInitial;
  selected: boolean;
  isSignature: boolean;
  isStamp: boolean;
  isSaving: boolean;
  isMenuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null> | null;
  onSelect: () => void;
  onToggleMenu: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}) => {
  return (
    <div className="relative">
      {/* THIS MUST BE THE CLICK TARGET */}
      <Button size="sm"
        inverted
        onClick={onSelect}
        disabled={isSaving}
        className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 transition-all ${
          selected
            ? "border-brand-400 bg-brand-50/70"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {item.isDefault && (
          <span className="absolute left-2 top-2 rounded-sm bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Default
          </span>
        )}

        {item.type === "typed" ? (
          <span
            className="text-5xl text-gray-800"
            style={{ fontFamily: "'Dancing Script', cursive" }}
          >
            {item.value || "-"}
          </span>
        ) : (
          <Image
            src={item.value}
            alt={isSignature ? "Signature" : isStamp ? "Stamp" : "Initials"}
            width={200}
            height={96}
            className="max-h-24 max-w-full"
            unoptimized
          />
        )}
      </Button>

      {/* MENU */}
      <div className="absolute right-2 top-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={(e) => {
            e.stopPropagation(); // 🔴 MUST stop selection
            onToggleMenu();
          }}
          className="p-1 rounded-full hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⋮
        </button>

        {isMenuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 mt-1 z-10 w-32 rounded-md border border-gray-300 bg-white shadow-lg"
          >
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                onMakeDefault();
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Make Default
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};




const CreateScreen: React.FC<CreateScreenProps> = ({
  isSignature,
  isStamp,
  createMode,
  typedValue,
  makeDefault,
  isSaving,
  canvasRef,
  fileInputRef,
  setCreateMode,
  setTypedValue,
  setDrawnValue,
  setMakeDefault,
  onCanvasEnd,
  onUpload,
  onBack,
}) => {
  return (
    <>
      {!isStamp && (
        <>
          {/* Mode Switch */}
          <div className="flex gap-4">
            <Button size="sm"
              disabled={isSaving}
              onClick={() => setCreateMode("typed")}
              className={`flex-1 ${
                createMode === "typed"
                  ? "bg-gray-200! text-gray-600 border-none"
                  : "border-gray-300"
              }`}
              icon={<Type />}
              label="Type"
              inverted
            />
            <Button size="sm"
              disabled={isSaving}
              onClick={() => setCreateMode("drawn")}
              className={`flex-1 ${
                createMode === "drawn"
                  ? "bg-gray-200! text-gray-600 border-none"
                  : "border-gray-300"
              }`}
              icon={<LineSquiggle />}
              label="Draw"
              inverted
            />
          </div>

          {createMode === "typed" && (
            <>
              <Input
                disabled={isSaving}
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                className="text-center my-3"
                placeholder={`Your ${isSignature ? "Signature" : "Initials"}`}
              />
              <div className="mb-3 flex h-32 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50">
                <span
                  className="text-5xl"
                  style={{ fontFamily: "'Dancing Script', cursive" }}
                >
                  {typedValue}
                </span>
              </div>
            </>
          )}

          {createMode === "drawn" && (
            <div className="rounded-md border border-dashed border-gray-300 my-3">
              <SignatureCanvas
                ref={canvasRef}
                penColor="black"
                canvasProps={{
                  width: 500,
                  height: 150,
                  className: "bg-white",
                }}
                onEnd={onCanvasEnd}
              />
              <div className="flex justify-end border-t border-dashed border-gray-300 bg-gray-50 p-2">
                <Button size="sm"
                  disabled={isSaving}
                  inverted
                  label="Clear"
                  onClick={() => {
                    canvasRef.current?.clear();
                    setDrawnValue(null);
                  }}
                  className="text-xs! py-2!"
                />
              </div>
            </div>
          )}
        </>
      )}

      {(isSignature || isStamp) && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png, image/jpeg"
            onChange={onUpload}
            style={{ display: "none" }}
          />
          <Button size="sm"
            type="button"
            aria-label={`Upload Your ${isStamp ? "Stamp" : "Signature"}`}
            disabled={isSaving}
            className={`flex w-full rounded-md border border-dashed border-gray-300 bg-white p-6 text-left hover:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500 ${
              isStamp && "h-48"
            }`}
            inverted
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex items-center">
              <Signature size={36} />
              <div className="ml-5">
                <span className="block font-semibold text-gray-900">
                  Upload Your {isStamp ? "Stamp" : "Signature"}
                </span>
                <small className="text-gray-600">
                  Upload an image of your{" "}
                  {isStamp ? "stamp" : "handwritten signature"} here.
                </small>
              </div>
            </div>
          </Button>
        </>
      )}

      <DefaultCheckbox
        makeDefault={makeDefault}
        setMakeDefault={setMakeDefault}
        disabled={isSaving}
      />

      <Button size="sm"
        type="button"
        disabled={isSaving}
        onClick={onBack}
        label="Back"
        icon={<ArrowLeft size={16} />}
        inverted
        className="absolute bottom-4 left-4"
      />
    </>
  );
};


/* ================= Default Checkbox ================= */

const DefaultCheckbox = ({
  makeDefault,
  setMakeDefault,
  disabled = false,
}: {
  makeDefault?: boolean;
  setMakeDefault?: (val: boolean) => void;
  disabled?: boolean;
}) => {
  if (makeDefault === undefined || !setMakeDefault) return null;

  return (
    <label className="flex items-center gap-2 text-sm mt-3">
      <input
        type="checkbox"
        checked={makeDefault}
        disabled={disabled}
        onChange={(e) => setMakeDefault(e.target.checked)}
      />
      Make this default
    </label>
  );
};
