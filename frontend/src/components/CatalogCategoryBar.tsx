import { useEffect, useRef, useState } from 'react';
import {
  getCategoryOptionsForTab,
  WEAPON_CATEGORY_TABS,
} from '../utils/catalog-filters';
import { WeaponCategoryIcon } from './WeaponCategoryIcon';
import { WeaponModelIcon } from './WeaponModelIcon';

type CatalogCategoryBarProps = {
  activeTabId: string;
  categoryValue: string;
  onTabChange: (tabId: string) => void;
  onCategoryChange: (value: string) => void;
};

export function CatalogCategoryBar({
  activeTabId,
  categoryValue,
  onTabChange,
  onCategoryChange,
}: CatalogCategoryBarProps) {
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenTabId(null);
      }
    }
    if (openTabId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    if (activeTabId !== tabId) {
      onTabChange(tabId);
    }
  }

  function handleModelSelect(value: string) {
    onCategoryChange(value);
    setOpenTabId(null);
  }

  return (
    <div
      className="catalog-category-bar"
      ref={barRef}
      role="tablist"
      aria-label="Категории оружия"
      data-testid="catalog-category-bar"
    >
      {WEAPON_CATEGORY_TABS.map((tab) => {
        const options = getCategoryOptionsForTab(tab.id);
        const isActive = activeTabId === tab.id;
        const tabSelectedOption = options.find((option) => option.value === categoryValue);

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
              className={`catalog-category-tab catalog-category-bar-tab${isActive ? ' active' : ''}`}
              data-testid={`catalog-category-tab-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
            >
              {tabSelectedOption?.modelIcon ? (
                <WeaponModelIcon
                  slug={tabSelectedOption.modelIcon}
                  fallbackIcon={tab.icon}
                />
              ) : (
                <WeaponCategoryIcon icon={tab.icon} />
              )}
              <span className="catalog-category-bar-label">
                {tabSelectedOption?.label ?? tab.label}
              </span>
            </button>

            {openTabId === tab.id && options.length > 0 ? (
              <div
                className="catalog-category-dropdown"
                data-testid={`catalog-category-dropdown-${tab.id}`}
              >
                <button
                  type="button"
                  className="catalog-category-dropdown-item"
                  onClick={() => {
                    onTabChange(tab.id);
                    setOpenTabId(null);
                  }}
                >
                  <WeaponCategoryIcon icon={tab.icon} />
                  <span>Все: {tab.label}</span>
                </button>
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`catalog-category-dropdown-item${
                      categoryValue === option.value ? ' active' : ''
                    }`}
                    data-testid={`catalog-category-option-${option.value.replace(/\s+/g, '-').toLowerCase()}`}
                    onClick={() => handleModelSelect(option.value)}
                  >
                    <WeaponModelIcon
                      slug={option.modelIcon}
                      fallbackIcon={option.icon ?? tab.icon}
                    />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
