// Staff accounts can optionally be scoped to a division and, further, to
// specific classes within it. No division set = unrestricted (kept
// backward-compatible with staff accounts created before this feature).
// Admins are never scoped.

export function getStaffScope(user) {
  if (!user || user.role === 'admin') return null;
  if (!user.division) return null;
  // Subject teachers work across the whole division, so their class
  // assignment (if any) never narrows their scope — they see every student
  // in the division. Class teachers stay pinned to their assigned classes.
  const classes = user.staffType === 'subject_teacher'
    ? null
    : (Array.isArray(user.classes) && user.classes.length > 0 ? user.classes : null);
  return {
    division: user.division,
    classes
  };
}

// Builds a division/class filter to merge into a Mongo query, respecting an
// explicitly-requested division/class from the caller when it's compatible
// with the staff member's own scope (lets a teacher assigned multiple
// classes narrow down to just one of their own), otherwise falling back to
// their full scope.
export function scopedDivisionClassFilter(user, { division, class: className } = {}) {
  const scope = getStaffScope(user);
  const filter = {};

  if (scope) {
    filter.division = scope.division;
    if (scope.classes) {
      filter.class = className && scope.classes.includes(className) ? className : { $in: scope.classes };
    } else if (className) {
      filter.class = className;
    }
  } else {
    if (division) filter.division = division;
    if (className) filter.class = className;
  }

  return filter;
}

// Checks whether a specific division/class combination (e.g. a student's, or
// a report card's) falls within a staff member's assigned scope.
export function isWithinScope(user, division, className) {
  const scope = getStaffScope(user);
  if (!scope) return true;
  if (division !== scope.division) return false;
  if (scope.classes && !scope.classes.includes(className)) return false;
  return true;
}

// Notices target a *list* of divisions (plus optionally 'all'), not a single
// one, and the admin UI doesn't yet expose per-class targeting — so notice
// scoping only narrows by division, not by class.
export function noticeDivisionScopeQuery(user) {
  const scope = getStaffScope(user);
  if (!scope) return {};
  return {
    $or: [
      { 'targetAudience.divisions': 'all' },
      { 'targetAudience.divisions': scope.division }
    ]
  };
}

export function isNoticeWithinDivisionScope(user, notice) {
  const scope = getStaffScope(user);
  if (!scope) return true;
  const divisions = notice.targetAudience?.divisions || [];
  return divisions.includes('all') || divisions.includes(scope.division);
}

// Same idea as the notice helpers above, but resources store their
// divisions at the top level (`divisions`) rather than nested under
// `targetAudience`.
export function resourceDivisionScopeQuery(user) {
  const scope = getStaffScope(user);
  if (!scope) return {};
  return {
    $or: [
      { divisions: 'all' },
      { divisions: scope.division }
    ]
  };
}

export function isResourceWithinDivisionScope(user, resource) {
  const scope = getStaffScope(user);
  if (!scope) return true;
  const divisions = resource.divisions || [];
  return divisions.includes('all') || divisions.includes(scope.division);
}
