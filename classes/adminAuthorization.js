/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

/**
 * Check a Discord user ID against the configured administrator allowlist.
 * Missing or malformed configuration denies access to every user.
 *
 * @param {string} userId Discord user ID; IDs must remain strings to preserve precision.
 * @param {string} [adminList=process.env.ADMIN_LIST] JSON array of strings or comma-separated IDs.
 * @returns {boolean} Whether the user is explicitly listed as an administrator.
 */
function isAdmin(userId, adminList = process.env.ADMIN_LIST) {
    if (typeof userId !== 'string' || !/^\d{17,20}$/.test(userId)) {
        return false;
    }

    if (typeof adminList !== 'string' || !adminList.trim()) {
        return false;
    }

    let adminIds;
    try {
        const trimmedList = adminList.trim();
        if (trimmedList.startsWith('[')) {
            adminIds = JSON.parse(trimmedList);
        } else {
            adminIds = trimmedList.split(',').map(id => id.trim());
        }
    } catch {
        return false;
    }

    // Reject the whole list when any entry is invalid; never grant partial access.
    if (!Array.isArray(adminIds)) {
        return false;
    }

    const hasValidIds = adminIds.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id));
    if (!hasValidIds) {
        return false;
    }

    return adminIds.includes(userId);
}

module.exports = { isAdmin };
