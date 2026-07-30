import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const SelectedChildContext = createContext();

export const useSelectedChild = () => {
  const context = useContext(SelectedChildContext);
  if (!context) {
    throw new Error('useSelectedChild must be used within a SelectedChildProvider');
  }
  return context;
};

// Gives every portal page a shared idea of "which student are we looking
// at" — a single child for students, whichever one a parent has picked from
// their list of children, or (for staff/admin, who have no student/children
// of their own) whichever student they've searched for and picked from
// their division/class scope. Every portal page (Dashboard, Notices,
// Resources, Bills, Report Cards, Exams) already accepts any studentId for
// staff/admin on the backend — this context is the only piece that was
// missing for those pages to work for staff too.
export const SelectedChildProvider = ({ children }) => {
  const { user, apiCall } = useAuth();
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';

  const childOptions = user?.role === 'parent' ? (user.children || []) : (user?.student ? [user.student] : []);
  const [selectedChildId, setSelectedChildId] = useState(childOptions[0]?.id || null);
  const [selectedStudentLabel, setSelectedStudentLabel] = useState(null);

  const [studentResults, setStudentResults] = useState([]);
  const [isSearchingStudents, setIsSearchingStudents] = useState(false);

  const searchStudents = useCallback(async (query = '') => {
    if (!isStaffOrAdmin) return [];
    setIsSearchingStudents(true);
    const params = new URLSearchParams({ limit: 20, status: 'active', ...(query && { search: query }) });
    const { data } = await apiCall(`/admin/students?${params}`);
    const results = data.success ? data.data.students : [];
    setStudentResults(results);
    setIsSearchingStudents(false);
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffOrAdmin]);

  const selectStudent = (student) => {
    setSelectedChildId(student._id);
    setSelectedStudentLabel(`${student.fullName} (${student.regNumber})`);
  };

  useEffect(() => {
    if (childOptions.length && !childOptions.some((c) => c.id === selectedChildId)) {
      setSelectedChildId(childOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Staff/admin default to whichever student their scope turns up first, so
  // the portal isn't blank on first load — they can search/switch from there.
  useEffect(() => {
    if (!isStaffOrAdmin) return;
    (async () => {
      const results = await searchStudents('');
      if (results.length > 0) selectStudent(results[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  return (
    <SelectedChildContext.Provider value={{
      selectedChildId,
      setSelectedChildId,
      childOptions,
      isStaffOrAdmin,
      selectedStudentLabel,
      studentResults,
      isSearchingStudents,
      searchStudents,
      selectStudent
    }}>
      {children}
    </SelectedChildContext.Provider>
  );
};
