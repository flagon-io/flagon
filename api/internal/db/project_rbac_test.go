package db

import "testing"

// TestEffectiveProjectRole locks the max(org-implied, grant) rule: a grant only
// ever elevates a member on a project, never drops them below their org floor.
func TestEffectiveProjectRole(t *testing.T) {
	cases := []struct {
		name    string
		orgRole string
		base    string
		grant   string
		want    string
	}{
		{"owner is always admin", RoleOwner, ProjectRoleRead, "", ProjectRoleAdmin},
		{"owner grant cannot demote", RoleOwner, ProjectRoleRead, ProjectRoleRead, ProjectRoleAdmin},
		{"admin is always admin", RoleAdmin, "none", "", ProjectRoleAdmin},
		// A member's floor is the org base permission (GitHub's model).
		{"member floor = base read", RoleMember, ProjectRoleRead, "", ProjectRoleRead},
		{"member floor = base write", RoleMember, ProjectRoleWrite, "", ProjectRoleWrite},
		{"member base none = no floor", RoleMember, BasePermissionNone, "", ""},
		{"member base none + explicit grant", RoleMember, BasePermissionNone, ProjectRoleWrite, ProjectRoleWrite},
		{"member elevated above base by grant", RoleMember, ProjectRoleRead, ProjectRoleAdmin, ProjectRoleAdmin},
		{"member read grant is a no-op when base is read", RoleMember, ProjectRoleRead, ProjectRoleRead, ProjectRoleRead},
		{"member grant below base is a no-op (base wins)", RoleMember, ProjectRoleWrite, ProjectRoleRead, ProjectRoleWrite},
		{"legacy viewer floor is read", RoleViewer, ProjectRoleRead, "", ProjectRoleRead},
		{"non-member with no grant has nothing", "", ProjectRoleRead, "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := EffectiveProjectRole(tc.orgRole, tc.base, tc.grant); got != tc.want {
				t.Fatalf("EffectiveProjectRole(%q, %q, %q) = %q, want %q", tc.orgRole, tc.base, tc.grant, got, tc.want)
			}
		})
	}
}

// TestProjectCan checks the capability ladder: each capability needs its minimum
// rank, and a higher role implies every lower one's capabilities.
func TestProjectCan(t *testing.T) {
	cases := []struct {
		role                          string
		view, write, manage, adminCap bool
	}{
		{ProjectRoleRead, true, false, false, false},
		{ProjectRoleTriage, true, false, false, false},
		{ProjectRoleWrite, true, true, false, false},
		{ProjectRoleMaintain, true, true, true, false},
		{ProjectRoleAdmin, true, true, true, true},
		{"", false, false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			if got := ProjectCan(tc.role, ProjCapView); got != tc.view {
				t.Errorf("ProjCapView(%q) = %v, want %v", tc.role, got, tc.view)
			}
			if got := ProjectCan(tc.role, ProjCapWrite); got != tc.write {
				t.Errorf("ProjCapWrite(%q) = %v, want %v", tc.role, got, tc.write)
			}
			if got := ProjectCan(tc.role, ProjCapManage); got != tc.manage {
				t.Errorf("ProjCapManage(%q) = %v, want %v", tc.role, got, tc.manage)
			}
			if got := ProjectCan(tc.role, ProjCapAdmin); got != tc.adminCap {
				t.Errorf("ProjCapAdmin(%q) = %v, want %v", tc.role, got, tc.adminCap)
			}
		})
	}
}
