import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { catalogOtherLabel, catalogTabLabel, useLocale } from '../i18n';
import {
  getCategoryOptionsForTab,
  WEAPON_CATEGORY_TABS,
  type CatalogCategoryOption,
  type CategorySelectionMode,
} from '../utils/catalog-filters';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';
import {
  prefetchCatalogModelPreviews,
  WeaponModelIcon,
} from './WeaponModelIcon';

export type CategorySelectionChange = {
  tabId: string;
  mode: CategorySelectionMode;
  values: string[];
};

type CatalogCategoryBarProps = {
  activeTabId: string;
  categoryMode: CategorySelectionMode;
  categoryValues: readonly string[];
  onTabChange: (tabId: string) => void;
  onCategorySelectionChange: (next: CategorySelectionChange) => void;
};

function optionDisplayLabel(
  option: CatalogCategoryOption,
  locale: 'ru' | 'en',
): string {
  if (option.tabId === 'other') {
    return catalogOtherLabel(option.value, locale);
  }
  return option.label;
}

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

function CatalogFilterCheckbox({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      className={`catalog-category-checkbox${checked ? ' checked' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden="true"
    >
      {checked ? (
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path
            d="M3.5 8.2 6.4 11l6.1-6.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

export function CatalogCategoryBar({
  activeTabId,
  categoryMode,
  categoryValues,
  onTabChange,
  onCategorySelectionChange,
}: CatalogCategoryBarProps) {
  const { locale, t } = useLocale();
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
  const selectedInOpenTab = new Set(
    openTab &&
      activeTabId === openTab.id &&
      categoryMode === 'subset'
      ? categoryValues
      : [],
  );
  const selectAllActive =
    Boolean(openTab) &&
    activeTabId === openTab?.id &&
    categoryMode === 'all';

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
  }, [openTabId, updateDropdownPosition, categoryValues, categoryMode]);

  useEffect(() => {
    if (!openTabId) {
      return;
    }
    const options = getCategoryOptionsForTab(openTabId);
    if (options.length === 0) {
      return;
    }
    prefetchCatalogModelPreviews(
      options.flatMap((option) =>
        [option.value, option.modelIcon, option.weapon].filter(
          (key): key is string => Boolean(key),
        ),
      ),
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

  function handleToggleOption(tabId: string, value: string) {
    const onThisTab = activeTabId === tabId;
    const selected = new Set(
      onThisTab && categoryMode === 'subset' ? categoryValues : [],
    );

    if (selected.has(value)) {
      selected.delete(value);
    } else {
      selected.add(value);
    }

    const nextValues = [...selected];
    onCategorySelectionChange({
      tabId,
      mode: nextValues.length === 0 ? 'empty' : 'subset',
      values: nextValues,
    });
  }

  function handleSelectAll() {
    if (!openTab) {
      return;
    }
    // Toggle: all ↔ empty. Never force all when clearing model checkboxes.
    if (activeTabId === openTab.id && categoryMode === 'all') {
      onCategorySelectionChange({
        tabId: openTab.id,
        mode: 'empty',
        values: [],
      });
      return;
    }
    onCategorySelectionChange({
      tabId: openTab.id,
      mode: 'all',
      values: [],
    });
  }

  function handleClearTabSelection(
    event: ReactMouseEvent,
    tabId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (activeTabId !== tabId) {
      return;
    }
    // Explicit clear of narrowing → back to browsing the whole tab.
    onCategorySelectionChange({
      tabId,
      mode: 'all',
      values: [],
    });
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
              role="menuitemcheckbox"
              aria-checked={selectAllActive}
              data-testid={`catalog-category-select-all-${openTab.id}`}
              onClick={handleSelectAll}
            >
              <span className="catalog-category-dropdown-select-all-label">
                {t('catalog.selectAll')}
              </span>
              <CatalogFilterCheckbox checked={selectAllActive} />
            </button>
            <div
              className="catalog-category-dropdown-divider"
              role="separator"
              aria-hidden="true"
            />
            {openOptions.map((option) => {
              const checked =
                activeTabId === openTab.id &&
                categoryMode === 'subset' &&
                selectedInOpenTab.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`catalog-category-dropdown-item catalog-category-dropdown-model${
                    checked ? ' active' : ''
                  }`}
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  data-testid={`catalog-category-option-${option.value.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => handleToggleOption(openTab.id, option.value)}
                >
                  <WeaponModelIcon
                    weapon={option.value || option.weapon}
                    slug={option.modelIcon}
                    fallbackIcon={option.icon ?? openTab.icon}
                    loading="eager"
                  />
                  <span className="catalog-category-dropdown-option-label">
                    {optionDisplayLabel(option, locale)}
                  </span>
                  <CatalogFilterCheckbox checked={checked} />
                </button>
              );
            })}
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
        aria-label={t('catalog.categoriesAria')}
        data-testid="catalog-category-bar"
      >
        <div className="catalog-category-bar-track" ref={trackRef}>
          {WEAPON_CATEGORY_TABS.map((tab) => {
            const options = getCategoryOptionsForTab(tab.id);
            const isActive = activeTabId === tab.id;
            const selectedCount =
              isActive && categoryMode === 'subset' ? categoryValues.length : 0;
            const hasMenu = options.length > 0;
            const tabName = catalogTabLabel(tab.id, locale);
            const label =
              selectedCount > 0
                ? t('catalog.tabSelectedCount', {
                    name: tabName,
                    count: selectedCount,
                  })
                : tabName;
            const showClear = isActive && categoryMode === 'subset' && selectedCount > 0;

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
                  <WeaponCategoryIcon icon={tab.icon} />
                  <span className="catalog-category-bar-label">{label}</span>
                  {showClear ? (
                    <span
                      className="catalog-category-bar-clear"
                      role="button"
                      tabIndex={-1}
                      aria-label={t('catalog.clearCategorySelection')}
                      data-testid={`catalog-category-clear-${tab.id}`}
                      onClick={(event) => handleClearTabSelection(event, tab.id)}
                    >
                      ×
                    </span>
                  ) : hasMenu ? (
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
