import type { CSSProperties } from "react";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Branch as DismissableLayerBranch } from "@radix-ui/react-dismissable-layer";

interface DropdownPortalProps {
  children: React.ReactNode;
  targetId: string;
  dropdown: string | null;
  onClose?: () => void; // optional callback when clicking outside
}

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const DropdownPortal: React.FC<DropdownPortalProps> = ({
  children,
  targetId,
  dropdown,
  onClose,
}) => {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !dropdown) {
      return;
    }

    const updatePosition = () => {
      const targetElement = document.getElementById(targetId);
      if (!targetElement) {
        setPosition(null);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const nextPosition = {
        top: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        maxHeight: Math.max(96, Math.min(150, Math.round(window.innerHeight - rect.bottom - 12))),
      };

      setPosition((current) => {
        if (
          current &&
          current.top === nextPosition.top &&
          current.left === nextPosition.left &&
          current.width === nextPosition.width &&
          current.maxHeight === nextPosition.maxHeight
        ) {
          return current;
        }

        return nextPosition;
      });
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && dropdownRef.current?.contains(target)) {
        return;
      }
      updatePosition();
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [targetId, dropdown]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        targetId && !document.getElementById(targetId)?.contains(e.target as Node)
      ) {
        if (onClose) onClose();
      }
    };

    if (dropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdown, targetId, onClose]);

  if (typeof window === 'undefined' || !dropdown || !position) return null;

  const portalStyle = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    width: position.width,
    zIndex: 1000002,
    pointerEvents: 'auto',
    '--dropdown-portal-max-height': `${position.maxHeight}px`,
  } as CSSProperties & { '--dropdown-portal-max-height': string };
  return createPortal(
    <DismissableLayerBranch
      ref={dropdownRef}
      data-dropdown-portal="true"
      style={portalStyle}
    >
      {children}
    </DismissableLayerBranch>,
    document.body
  );
};
DropdownPortal.displayName = "DropdownPortal";
export default DropdownPortal;
