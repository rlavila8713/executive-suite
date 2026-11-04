import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  UserCog,
  ShoppingCart,
  Wallet,
  Boxes,
  Warehouse,
  Tags,
  BarChart3,
  Settings2,
  Smartphone,
  Check,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, Button } from "../../components/ui";
import { api } from "../../api/client";
import type { AppPermission, AppRole, AppRoleKey } from "../../types";
import {
  mobileModulesForPermissionKeys,
  permissionsByGroup,
  PERMISSION_GROUP_ORDER,
  type PermissionGroupId,
} from "../../lib/rbacUi";
import { useI18n } from "../../i18n/I18nContext";
import { mapMutationError } from "../../lib/mutationErrors";
import { cn } from "../../lib/utils";

const GROUP_ICONS: Record<PermissionGroupId, LucideIcon> = {
  sales: ShoppingCart,
  cash: Wallet,
  inventory: Boxes,
  warehouse: Warehouse,
  catalog: Tags,
  reports: BarChart3,
  administration: Settings2,
};

function permissionLabel(t: (key: string) => string, key: string): string {
  const parts = key.split(".");
  if (parts.length === 2) return t(`users.perm.${parts[0]}.${parts[1]}`);
  return key;
}

const MOBILE_MODULE_LABELS: Record<string, string> = {
  pos: "users.mobileModulePos",
  cash: "users.mobileModuleCash",
  inventory: "users.mobileModuleInventory",
  warehouse: "users.mobileModuleWarehouse",
  customers: "users.mobileModuleCustomers",
};

type Props = {
  roles: AppRole[];
  catalog: AppPermission[];
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
  onMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
};

export function RolePermissionsEditor({
  roles,
  catalog,
  disabled,
  onSaved,
  onMessage,
}: Props) {
  const { t } = useI18n();
  const [activeRole, setActiveRole] = useState<AppRoleKey>("manager");
  const [draft, setDraft] = useState<Record<AppRoleKey, Set<string>>>(() => ({
    manager: new Set(),
    seller: new Set(),
  }));
  const [dirty, setDirty] = useState<Record<AppRoleKey, boolean>>({
    manager: false,
    seller: false,
  });
  const [saving, setSaving] = useState(false);

  const roleOptions = useMemo(
    () => roles.filter((r) => r.key === "manager" || r.key === "seller"),
    [roles],
  );

  const grouped = useMemo(() => permissionsByGroup(catalog), [catalog]);

  useEffect(() => {
    const next: Record<AppRoleKey, Set<string>> = {
      manager: new Set(),
      seller: new Set(),
    };
    for (const role of roleOptions) {
      next[role.key] = new Set(role.permissionKeys);
    }
    setDraft(next);
    setDirty({ manager: false, seller: false });
  }, [roleOptions]);

  const activeSet = draft[activeRole] ?? new Set<string>();
  const mobilePreview = mobileModulesForPermissionKeys([...activeSet]);

  const togglePermission = (key: string) => {
    setDraft((prev) => {
      const set = new Set(prev[activeRole]);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, [activeRole]: set };
    });
    setDirty((prev) => ({ ...prev, [activeRole]: true }));
  };

  const setGroupAll = (groupId: PermissionGroupId, enabled: boolean) => {
    const keys = grouped.get(groupId) ?? [];
    setDraft((prev) => {
      const set = new Set(prev[activeRole]);
      for (const p of keys) {
        if (enabled) set.add(p.key);
        else set.delete(p.key);
      }
      return { ...prev, [activeRole]: set };
    });
    setDirty((prev) => ({ ...prev, [activeRole]: true }));
  };

  const resetRole = () => {
    const role = roleOptions.find((r) => r.key === activeRole);
    if (!role) return;
    setDraft((prev) => ({
      ...prev,
      [activeRole]: new Set(role.permissionKeys),
    }));
    setDirty((prev) => ({ ...prev, [activeRole]: false }));
  };

  const saveRole = async () => {
    const keys = [...(draft[activeRole] ?? [])];
    if (keys.length === 0) {
      onMessage({ type: "err", text: t("users.rolePermissionsEmpty") });
      return;
    }
    setSaving(true);
    onMessage(null);
    try {
      await api.updateRolePermissions(activeRole, keys);
      setDirty((prev) => ({ ...prev, [activeRole]: false }));
      onMessage({ type: "ok", text: t("users.rolePermissionsSaved") });
      await onSaved();
    } catch (e) {
      onMessage({ type: "err", text: mapMutationError(e, t) });
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (key: AppRoleKey) =>
    key === "manager" ? t("users.roleManager") : t("users.roleSeller");

  if (catalog.length === 0) return null;

  return (
    <Card title={t("users.rolesTitle")}>
      <p className="text-xs text-on-surface-variant mt-2 mb-6 max-w-3xl">
        {t("users.rolesHint")}
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {roleOptions.map((role) => {
          const isActive = activeRole === role.key;
          const Icon = role.key === "manager" ? Shield : UserCog;

          return (
            <button
              key={role.id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveRole(role.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all border",
                isActive
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-surface-container-lowest text-on-surface-variant border-black/5 hover:bg-surface-container-low",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Icon size={16} />
              {roleLabel(role.key)}

              {dirty[role.key] ? (
                <span
                  className="w-2 h-2 rounded-full bg-amber-400"
                  title={t("users.unsavedChanges")}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-black/5 bg-surface-container-lowest/80 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <Smartphone size={14} />
          {t("users.mobileModulesPreview")}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {mobilePreview.length === 0 ? (
            <span className="text-sm text-on-surface-variant">
              {t("users.mobileModulesNone")}
            </span>
          ) : (
            mobilePreview.map((mod) => (
              <span
                key={mod}
                className="inline-flex items-center rounded-full bg-tertiary-container/25 text-on-tertiary-container px-3 py-1 text-xs font-semibold"
              >
                {t(MOBILE_MODULE_LABELS[mod] ?? mod)}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PERMISSION_GROUP_ORDER.map((groupId) => {
          const perms = grouped.get(groupId) ?? [];
          if (perms.length === 0) return null;
          const Icon = GROUP_ICONS[groupId];
          const allOn = perms.every((p) => activeSet.has(p.key));
          const someOn = perms.some((p) => activeSet.has(p.key));

          return (
            <div
              key={groupId}
              className="rounded-xl border border-black/5 bg-white dark:bg-slate-900/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-primary">
                      {t(`users.permGroup.${groupId}`)}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      {t(`users.permGroupHint.${groupId}`)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setGroupAll(groupId, !allOn)}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0",
                    someOn
                      ? "text-primary bg-primary/10"
                      : "text-on-surface-variant bg-surface-container-high",
                  )}
                >
                  {allOn ? t("users.permGroupClear") : t("users.permGroupAll")}
                </button>
              </div>
              <ul className="space-y-2">
                {perms.map((perm) => {
                  const checked = activeSet.has(perm.key);
                  const affectsMobile =
                    perm.scope === "mobile" || perm.scope === "both";
                  return (
                    <li key={perm.key}>
                      <label
                        className={cn(
                          "flex items-start gap-3 rounded-lg p-2.5 cursor-pointer transition-colors",
                          checked
                            ? "bg-primary/5"
                            : "hover:bg-surface-container-low",
                          disabled && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-none"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => togglePermission(perm.key)}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">
                              {permissionLabel(t, perm.key)}
                            </span>
                            {affectsMobile ? (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-tertiary px-1.5 py-0.5 rounded bg-tertiary-container/20">
                                {t("users.permBadgeMobile")}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-[10px] text-on-surface-variant font-mono mt-0.5">
                            {perm.key}
                          </span>
                        </span>
                        {checked ? (
                          <Check
                            size={16}
                            className="text-primary shrink-0 mt-0.5"
                          />
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-6 pt-4 border-t border-black/5">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || saving || !dirty[activeRole]}
          onClick={resetRole}
        >
          <RotateCcw size={14} className="mr-2" />
          {t("users.rolePermissionsReset")}
        </Button>
        <Button
          type="button"
          disabled={disabled || saving || !dirty[activeRole]}
          onClick={() => void saveRole()}
        >
          {saving ? t("users.saving") : t("users.rolePermissionsSave")}
        </Button>
      </div>
    </Card>
  );
}
