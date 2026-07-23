import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getCategoryOptionsForTab,
  WEAPON_CATEGORY_TABS,
} from '../utils/catalog-filters';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';
import {
  prefetchCatalogModelPreviews,
  WeaponModelIcon,
} from './WeaponModelIcon';

type CatalogCategoryBarProps = {
  activeTabId: string;
  categoryValue: string;
  onTabChange: (tabId: string) => void;
  onCategoryChange: (value: string) => void;
};

type DropdownPosition = {
  top: number;
  left: number;
  minWidth: number;
};

const DROPDOWN_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 12;

function getDropdownPosition(
  anchor: DOMRect,
  menuWidth: number,
  alignRight: boolean,
): DropdownPosition {
  const maxLeft = window.innerWidth - menuWidth - VIEWPORT_PADDING_PX;
  let left = alignRight ? anchor.right - menuWidth : anchor.left;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, maxLeft));

  return {
    top: anchor.bottom + DROPDOWN_GAP_PX,
    left,
    minWidth: Math.max(220, anchor.width),
  };
}

export function CatalogCategoryBar({
  activeTabId,
  categoryValue,
  onTabChange,
  onCategoryChange,
}: CatalogCategoryBarProps) {
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(
    null,
  );
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const openTab = WEAPON_CATEGORY_TABS.find((tab) => tab.id === openTabId);
  const openOptions = openTab ? getCategoryOptionsForTab(openTab.id) : [];
  const selectAllActive =
    Boolean(openTab) && activeTabId === openTab?.id && !categoryValue;

  const updateDropdownPosition = useCallback(() => {
    if (!openTabId) {
      return;
    }

    const anchor = tabButtonRefs.current.get(openTabId);
    if (!anchor) {
      return;
    }

    const menuWidth = menuRef.current?.offsetWidth ?? 240;
    const alignRight = openTabId === 'other';
    setDropdownPosition(
      getDropdownPosition(anchor.getBoundingClientRect(), menuWidth, alignRight),
    );
  }, [openTabId]);

  useLayoutEffect(() => {
    if (!openTabId) {
      setDropdownPosition(null);
      return;
    }
    updateDropdownPosition();
  }, [openTabId, updateDropdownPosition, categoryValue]);

  useEffect(() => {
    if (!openTabId) {
      return;
    }
    const options = getCategoryOptionsForTab(openTabId);
    if (options.length === 0) {
      return;
    }
    prefetchCatalogModelPreviews(
      options.map((option) => option.weapon ?? option.value).filter(Boolean),
    );
  }, [openTabId]);

  useLayoutEffect(() => {
    if (!openTabId || !menuRef.current) {
      return;
    }
    updateDropdownPosition();
  }, [openTabId, openOptions.length, updateDropdownPosition]);

  useEffect(() => {
    if (!openTabId) {
      return;
    }

    function handleResize() {
      updateDropdownPosition();
    }

    /** Close on page/container scroll so the menu stays fixed — never "chases" the tab. */
    function handleScroll(event: Event) {
      const target = event.target;
      if (
        target instanceof Node &&
        menuRef.current &&
        (target === menuRef.current || menuRef.current.contains(target))
      ) {
        return;
      }
      setOpenTabId(null);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openTabId, updateDropdownPosition]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (barRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpenTabId(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenTabId(null);
      }
    }

    if (openTabId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openTabId]);

  function handleTabClick(tabId: string) {
    const options = getCategoryOptionsForTab(tabId);
    if (tabId === 'all') {
      setOpenTabId(null);
      onTabChange('all');
      return;
    }

    if (options.length === 0) {
      setOpenTabId(null);
      onTabChange(tabId);
      return;
    }

    setOpenTabId((current) => (current === tabId ? null : tabId));
  }

  function handleModelSelect(value: string) {
    onCategoryChange(value);
    setOpenTabId(null);
  }

  function handleSelectAll() {
    if (!openTab) {
      return;
    }
    onTabChange(openTab.id);
    setOpenTabId(null);
  }

  function setTabButtonRef(tabId: string, node: HTMLButtonElement | null) {
    if (node) {
      tabButtonRefs.current.set(tabId, node);
    } else {
      tabButtonRefs.current.delete(tabId);
    }
  }

  const dropdown =
    openTab && openOptions.length > 0
      ? createPortal(
          <div
            ref={menuRef}
            className="catalog-category-dropdown catalog-category-dropdown-portal"
            style={
              dropdownPosition
                ? {
                    top: dropdownPosition.top,
                    left: dropdownPosition.left,
                    minWidth: dropdownPosition.minWidth,
                  }
                : { visibility: 'hidden', top: 0, left: 0, minWidth: 240 }
            }
            data-testid={`catalog-category-dropdown-${openTab.id}`}
            role="menu"
          >
            <button
              type="button"
              className={`catalog-category-dropdown-item catalog-category-dropdown-select-all${
                selectAllActive ? ' active' : ''
              }`}
              role="menuitem"
              data-testid={`catalog-category-select-all-${openTab.id}`}
              onClick={handleSelectAll}
            >
              <span className="catalog-category-dropdown-select-all-label">
                Выбрать все
              </span>
            </button>
            <div
              className="catalog-category-dropdown-divider"
              role="separator"
              aria-hidden="true"
            />
            {openOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`catalog-category-dropdown-item catalog-category-dropdown-model${
                  categoryValue === option.value ? ' active' : ''
                }`}
                role="menuitem"
                data-testid={`catalog-category-option-${option.value.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => handleModelSelect(option.value)}
              >
                <WeaponModelIcon
                  weapon={option.weapon ?? option.value}
                  slug={option.modelIcon}
                  fallbackIcon={option.icon ?? openTab.icon}
                  loading="eager"
                />
                <span>{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className="catalog-category-bar"
        ref={barRef}
        role="tablist"
        aria-label="Категории"
        data-testid="catalog-category-bar"
      >
        <div className="catalog-category-bar-track" ref={trackRef}>
          {WEAPON_CATEGORY_TABS.map((tab) => {
            const options = getCategoryOptionsForTab(tab.id);
            const isActive = activeTabId === tab.id;
            const tabSelectedOption = options.find(
              (option) => option.value === categoryValue,
            );
            const hasMenu = options.length > 0;

            return (
              <div
                key={tab.id}
                className={`catalog-category-bar-item${isActive ? ' active' : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-expanded={openTabId === tab.id}
                  aria-haspopup={hasMenu ? 'menu' : undefined}
                  ref={(node) => setTabButtonRef(tab.id, node)}
                  className={`catalog-category-tab catalog-category-bar-tab${
                    isActive ? ' active' : ''
                  }`}
                  data-testid={`catalog-category-tab-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                >
                  {tabSelectedOption?.modelIcon ? (
                    <WeaponModelIcon
                      weapon={tabSelectedOption.weapon ?? tabSelectedOption.value}
                      slug={tabSelectedOption.modelIcon}
                      fallbackIcon={tab.icon}
                    />
                  ) : (
                    <WeaponCategoryIcon icon={tab.icon} />
                  )}
                  <span className="catalog-category-bar-label">
                    {tabSelectedOption?.label ?? tab.label}
                  </span>
                  {hasMenu ? (
                    <span className="catalog-category-bar-chevron" aria-hidden="true">
                      ▾
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {dropdown}
    </>
  );
}
