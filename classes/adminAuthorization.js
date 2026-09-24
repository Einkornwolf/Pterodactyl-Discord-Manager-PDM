// Treat missing or malformed configuration as an empty allowlist.
function isAdmin(userId, raw = process.env.ADMIN_LIST) {
    if (typeof raw !== 'string' || !raw.trim()) return false;
    let ids;
    try {
        ids = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',').map(id => id.trim());
    } catch {
        return false;
    }
    return Array.isArray(ids) && ids.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id))
        && ids.includes(String(userId));
}
module.exports = { isAdmin };
