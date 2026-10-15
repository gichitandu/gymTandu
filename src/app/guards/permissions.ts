import { RoleName } from "../models/domain";
// Capability abstraction only: local roles are not a security boundary.
export interface PermissionProvider {
  can(role: RoleName, permission: string): boolean;
}
export class LocalPermissions implements PermissionProvider {
  can(role: RoleName, permission: string) {
    return (
      role === "SuperAdmin" ||
      (role === "Admin" && permission === "catalog:write") ||
      permission.endsWith(":own")
    );
  }
}
