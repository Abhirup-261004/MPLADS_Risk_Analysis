// Agency accounts must never be able to broaden their work query with client parameters.
export function workScopeForUser(user) {
  if (user?.profileType !== 'agency' && user?.role !== 'agency') return {};
  if (!user.agencyName) return { _id: null };

  const scope = { agency: user.agencyName };
  if (user.state) scope.state = user.state;
  if (user.district) scope.district = user.district;
  return scope;
}
