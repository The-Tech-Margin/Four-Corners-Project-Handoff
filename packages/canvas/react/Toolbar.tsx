/**
 * @module react/Toolbar
 * Extensible toolbar component with icon buttons and safe area support.
 */

import React from 'react';
import { useCanvasContext } from './CanvasProvider';

/** A single toolbar button item. */
export interface ToolbarItem {
  /** Unique identifier. */
  id: string;
  /** Icon identifier (consumed by the host app's icon renderer). */
  icon: string;
  /** Accessible label text. */
  label: string;
  /** Click handler. */
  action: () => void;
  /** Whether the button is in an active/pressed state. */
  active?: boolean;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Optional group key for visual dividers between groups. */
  group?: string;
}

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** Toolbar position. Defaults to 'bottom'. */
  position?: 'top' | 'bottom';
  /** Toolbar items to render. */
  items: ToolbarItem[];
  /** Optional CSS class name. */
  className?: string;
}

/**
 * An extensible toolbar that renders icon buttons with theme styling.
 * Bottom position includes safe-area-inset-bottom padding via CSS variable.
 */
export function Toolbar({
  position = 'bottom',
  items,
  className,
}: ToolbarProps) {
  const { theme } = useCanvasContext();

  const isBottom = position === 'bottom';

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    ...(isBottom
      ? { bottom: 0, paddingBottom: 'var(--ock-safe-bottom, env(safe-area-inset-bottom, 0px))' }
      : { top: 0 }),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 16px',
    background: theme.toolbarBg,
    borderTop: isBottom ? `1px solid ${theme.toolbarBorder}` : 'none',
    borderBottom: !isBottom ? `1px solid ${theme.toolbarBorder}` : 'none',
    zIndex: 100,
  };

  let lastGroup: string | undefined;

  return (
    <div className={className} style={containerStyle}>
      {items.map((item) => {
        const showDivider = item.group !== undefined && item.group !== lastGroup && lastGroup !== undefined;
        lastGroup = item.group;

        return (
          <React.Fragment key={item.id}>
            {showDivider && (
              <div
                style={{
                  width: 1,
                  height: 24,
                  background: theme.toolbarBorder,
                  margin: '0 4px',
                }}
              />
            )}
            <button
              title={item.label}
              disabled={item.disabled}
              onClick={item.action}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                border: 'none',
                borderRadius: 6,
                background: item.active ? `${theme.toolbarIconActiveColor}20` : 'transparent',
                color: item.active ? theme.toolbarIconActiveColor : theme.toolbarIconColor,
                cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.4 : 1,
                fontSize: 16,
                padding: 0,
              }}
            >
              {item.icon}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
