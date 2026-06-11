// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.

export const BRLogo = () => (
            <svg width="36" height="36" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="br-logo">
                <g transform="rotate(-4 100 100)">
                    <rect x="14" y="14" width="172" height="172" rx="22" fill="#FFD23F" stroke="#1A1A1A" strokeWidth="8"/>
                    <text x="100" y="136" fontFamily="'Bricolage Grotesque', 'Inter', system-ui, sans-serif" fontWeight="800" fontSize="92" textAnchor="middle" fill="#1A1A1A" letterSpacing="-5">brv.</text>
                </g>
            </svg>
        );
