// ==UserScript==
// @name         osu!gacha Delete cards from pull
// @namespace    https://gacha.miz.to/
// @version      1.6
// @description  Adds a delete button to rolled cards so you can remove them immediately from the pull screen.
// @match        https://gacha.miz.to/*
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/thesakamata/Delete-cards-from-pull/refs/heads/main/delete-cards-from-pull.js
// @updateURL    https://raw.githubusercontent.com/thesakamata/Delete-cards-from-pull/refs/heads/main/delete-cards-from-pull.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        showConfirm: false,
        debug: false,
    };

    const FACE_MARKER = 'data-og-delete-enhanced';
    const BTN_MARKER = 'data-og-delete-button';

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function log(...args) {
        if (CONFIG.debug) {
            console.log('[osu!gacha-delete]', ...args);
        }
    }

    function getRolledCardFaces() {
        return Array.from(document.querySelectorAll('.perspective-midrange'))
            .map(wrapper => wrapper.querySelector('.backface-hidden.absolute.inset-0.rotate-y-180'))
            .filter(Boolean)
            .filter(face => face.querySelector('a[href*="osu.ppy.sh/users/"]'));
    }

    function getProfileLink(face) {
        return face.querySelector('a[href*="osu.ppy.sh/users/"]');
    }

    function getUserIdFromFace(face) {
        const link = getProfileLink(face);
        if (!link) return null;

        const match = link.href.match(/\/users\/(\d+)/);
        return match ? Number(match[1]) : null;
    }

    function getUsernameFromFace(face) {
        const link = getProfileLink(face);
        if (!link) return null;

        const nameEl = link.querySelector('p.font-bold');
        return nameEl?.textContent?.trim() || null;
    }

    function getRarityFromFace(face) {
        const link = getProfileLink(face);
        if (!link) return null;

        const ps = Array.from(link.querySelectorAll('p'));
        const rarityEl = ps.find(el => {
            const text = el.textContent.trim().toUpperCase();
            return ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].includes(text);
        });

        return rarityEl ? rarityEl.textContent.trim() : null;
    }

    async function deleteCard(playerId) {
        const response = await fetch('https://gacha.miz.to/api/collection', {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
            },
            body: JSON.stringify({
                playerIds: [playerId],
            }),
        });

        if (!response.ok) {
            throw new Error(`Delete failed (${response.status} ${response.statusText})`);
        }

        return true;
    }

    async function fadeOutAndRemove(face) {
        const cardRoot = face.closest('.perspective-midrange') || face;
        cardRoot.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        cardRoot.style.opacity = '0';
        cardRoot.style.transform = 'scale(0.96)';
        await sleep(200);
        cardRoot.remove();
    }

    // 🔹 Tooltip creator
    function createTooltip(text) {
        const tooltip = document.createElement('div');
        tooltip.textContent = text;

        Object.assign(tooltip.style, {
            position: 'fixed',
            zIndex: '9999',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            background: 'rgba(17, 24, 39, 0.95)',
            color: '#f9fafb',
            border: '1px solid #374151',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            opacity: '0',
            transition: 'opacity 0.15s ease',
            whiteSpace: 'nowrap',
        });

        document.body.appendChild(tooltip);
        return tooltip;
    }

    function makeDeleteButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute(BTN_MARKER, '1');
        btn.title = 'Delete this card';
        btn.textContent = '🗑';

        Object.assign(btn.style, {
            position: 'absolute',
            left: '50%',
            bottom: '2px',
            transform: 'translateX(-50%)',
            zIndex: '40',
            width: '34px',
            height: '34px',
            borderRadius: '9999px',
            border: '1px solid #374151',
            background: 'rgba(17, 24, 39, 0.96)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
            fontSize: '17px',
            lineHeight: '1',
            userSelect: 'none',
        });

        const tooltip = createTooltip('⚠ Deletes favorited cards');

        btn.addEventListener('mouseenter', () => {
            if (!btn.disabled) {
                btn.style.background = '#ef4444';
                btn.style.borderColor = '#ef4444';
                tooltip.style.opacity = '1';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (!btn.disabled) {
                btn.style.background = 'rgba(17, 24, 39, 0.96)';
                btn.style.borderColor = '#374151';
                tooltip.style.opacity = '0';
            }
        });

        btn.addEventListener('mousemove', (e) => {
            tooltip.style.left = `${e.clientX + 12}px`;
            tooltip.style.top = `${e.clientY + 12}px`;
        });

        return btn;
    }

    function injectDeleteButton(face) {
        if (!(face instanceof HTMLElement)) return;
        if (face.hasAttribute(FACE_MARKER)) return;

        const cardShell = face.firstElementChild;
        if (!(cardShell instanceof HTMLElement)) return;

        if (getComputedStyle(cardShell).position === 'static') {
            cardShell.style.position = 'relative';
        }

        const playerId = getUserIdFromFace(face);
        const username = getUsernameFromFace(face);
        const rarity = getRarityFromFace(face);

        if (!playerId) return;

        const btn = makeDeleteButton();

        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (CONFIG.showConfirm) {
                const ok = confirm(`Delete ${username || 'this card'}${rarity ? ` (${rarity})` : ''}?`);
                if (!ok) return;
            }

            btn.disabled = true;
            btn.textContent = '…';
            btn.style.background = '#ef4444';

            try {
                log('Deleting', playerId);
                await deleteCard(playerId);
                await fadeOutAndRemove(face);
            } catch (error) {
                console.error(error);
                btn.disabled = false;
                btn.textContent = '🗑';
                btn.style.background = 'rgba(17, 24, 39, 0.96)';
                alert('Delete failed.');
            }
        });

        cardShell.appendChild(btn);
        face.setAttribute(FACE_MARKER, '1');
    }

    function scan() {
        const faces = getRolledCardFaces();
        for (const face of faces) {
            injectDeleteButton(face);
        }
    }

    const observer = new MutationObserver(scan);

    scan();
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
})();
