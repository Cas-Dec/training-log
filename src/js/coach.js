// ── AI COACH ───────────────────────────────────────────────────────
let conversationHistory = [];

function impactLabel(v) {
  if (v >= 100) return 'maximal';
  if (v >= 65)  return 'very high';
  if (v >= 40)  return 'high';
  if (v >= 22)  return 'medium to high';
  if (v >= 12)  return 'medium';
  if (v >= 6)   return 'low to medium';
  if (v >= 2)   return 'low';
  if (v >= 0.5) return 'very low';
  return 'none';
}

function buildContext() {
  const userSessions = sessions.filter(s => (s.user || 'Cas') === currentUser);
  if (!userSessions.length) return `No sessions logged yet for ${currentUser}.`;

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const shown  = userSessions.filter(s => new Date(s.date).getTime() >= cutoff);

  const nrgAbbr = { 'above-average': 'hi', 'average': 'avg', 'below-average': 'lo' };
  const slpAbbr = { 'good': 'g', 'average': 'a', 'poor': 'p' };
  const recAbbr = { 'good': 'g', 'normal': 'n', 'poor': 'p' };

  const isCas = currentUser === 'Cas';
  const header = isCas
    ? 'date|type|nrg|slp|rec|kps|load|details'
    : 'date|type|nrg|slp|rec|details';

  const lines = shown.map(s => {
    const nrg = nrgAbbr[s.energy]   ?? '?';
    const slp = slpAbbr[s.sleep]    ?? '?';
    const rec = recAbbr[s.recovery] ?? '?';
    const isCardio = CARDIO_TYPES.includes(s.type);

    let details;
    if (isCardio) {
      details = [
        s.duration  != null ? `${s.duration}min`  : null,
        s.intensity ?? null,
        s.hr?.avg   != null ? `HR${s.hr.avg}${s.hr.max != null ? '/'+s.hr.max : ''}` : null,
        s.speed?.avg!= null ? `${s.speed.avg}kph${s.speed.max != null ? '/'+s.speed.max : ''}` : null,
      ].filter(Boolean).join(' ');
    } else {
      details = (s.exercises || [])
        .map(e => `${e.name} ${(e.loading||'').replace(/kg/gi,'').trim()}${e.rpe?' '+e.rpe:''}`.trim())
        .join('; ') || '—';
    }

    let main;
    if (isCas) {
      const m = s.kps?.morning != null && s.kps.morning !== '' ? s.kps.morning : '?';
      const p = s.kps?.post    != null && s.kps.post    !== '' ? s.kps.post    : '?';
      const load = sessionPatellarVolume(s);
      const loadStr = load > 0 ? `${load.toFixed(0)}(${impactLabel(load)})` : '';
      main = `${s.date}|${s.type}|${nrg}|${slp}|${rec}|${m}→${p}|${loadStr}|${details}`;
    } else {
      main = `${s.date}|${s.type}|${nrg}|${slp}|${rec}|${details}`;
    }

    const note = (s.notes || '').trim().replace(/^—$/, '');
    return note ? `${main}\n  ${note}` : main;
  }).join('\n');

  let loadingCtx = '';
  if (isCas) {
    const exList = Object.entries(lookup.exercises)
      .filter(([,v]) => v.strain_factor > 0)
      .map(([name,v]) => `${name}:${v.strain_factor}${v.bodyweight?'+BW':''}`)
      .join(' | ');
    loadingCtx = `\n\nLOAD MODEL: strain_factor×weight×log₁₀(10+sets×reps), BW=${BODYWEIGHT_KG}kg; cardio: loading_min×scale×√min
Labels: maximal≥100 | very high≥65 | high≥40 | medium to high≥22 | medium≥12 | low to medium≥6 | low≥2 | very low≥0.5
Exercises: ${exList||'(none)'}
Factor update: \`\`\`json\n{"type":"lookup-update","exercises":{"name":{"strain_factor":X}}}\`\`\``;
  }

  let bwCtx = '';
  if (bodyweightLog.length) {
    const bwCutoff = Date.now() - 30 * 864e5;
    const recent = bodyweightLog.filter(e => new Date(e.date).getTime() >= bwCutoff).slice(0, 14);
    if (recent.length) bwCtx = `\nBW(kg,last30d): ${recent.map(e => `${e.date}:${e.weight}`).join(' ')}`;
  }

  return `TRAINING LOG ${currentUser} (${userSessions.length} total, last 12w shown):\n${header}\n${lines}${bwCtx}${loadingCtx}`;
}

const SYSTEM_PROMPT_FALLBACK = `You are an expert strength & conditioning coach specialising in progressive overload, training load management, and injury prevention (especially knee health).

You have access to the athlete's complete training log below. Your role:
- Identify real trends from the data — progression, stagnation, volume spikes, RPE patterns
- Flag concerns: rising KPS, insufficient recovery, repeated RPE10 efforts, imbalanced volume
- Make specific, actionable recommendations using actual numbers from the log
- Be concise. Use short paragraphs — no bullet lists unless genuinely listing distinct items.
- If data is sparse, say so and offer sensible defaults.`;

function clearConversation() {
  conversationHistory = [];
  const thread = document.getElementById('coach-thread');
  thread.innerHTML = '<p class="ai-placeholder" id="coach-placeholder">Your coach\'s response will appear here.</p>';
  document.getElementById('clear-chat-btn').style.display = 'none';
}

async function askCoach(q) {
  q = q || document.getElementById('coach-q').value.trim();
  if (!q) return;

  document.getElementById('coach-q').value = '';
  document.getElementById('coach-btn').disabled = true;
  document.getElementById('coach-placeholder')?.remove();
  document.getElementById('clear-chat-btn').style.display = '';

  const thread = document.getElementById('coach-thread');

  // User bubble
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg-user';
  userDiv.textContent = q;
  thread.appendChild(userDiv);

  // Assistant bubble (thinking state)
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'chat-msg-assistant';
  assistantDiv.textContent = 'Thinking…';
  thread.appendChild(assistantDiv);
  assistantDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });

  conversationHistory.push({ role: 'user', content: q });

  const staticText = [coreInstructions || SYSTEM_PROMPT_FALLBACK, userContextMd]
    .filter(Boolean).join('\n\n---\n\n');
  const system = [
    { type: 'text', text: staticText },
    { type: 'text', text: buildContext(), cache_control: { type: 'ephemeral' } },
  ].filter(b => b.text && b.text.trim());

  try {
    const res = await authFetch(`${WORKER}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system,
        messages: conversationHistory,
      })
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text || '').join('') || JSON.stringify(data);

    conversationHistory.push({ role: 'assistant', content: text });
    assistantDiv.innerHTML = marked.parse(text);

    // Detect lookup-update JSON blocks and offer Apply button
    for (const [, jsonStr] of [...text.matchAll(/```json\n([\s\S]*?)\n```/g)]) {
      try {
        const upd = JSON.parse(jsonStr);
        if (upd.type !== 'lookup-update') continue;
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-secondary';
        applyBtn.style.marginTop = '12px';
        applyBtn.textContent = '↻ Apply suggested loading changes';
        applyBtn.onclick = () => { applyLookupUpdate(upd); applyBtn.textContent = '✓ Applied'; applyBtn.disabled = true; };
        assistantDiv.appendChild(applyBtn);
      } catch(e) {}
    }
    // Detect user-context blocks and offer Apply button
    for (const [, content] of [...text.matchAll(/```user-context\n([\s\S]*?)\n```/g)]) {
      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-secondary';
      applyBtn.style.marginTop = '12px';
      applyBtn.textContent = '↻ Apply context update';
      applyBtn.onclick = () => { applyContextUpdate(content); applyBtn.textContent = '✓ Applied'; applyBtn.disabled = true; };
      assistantDiv.appendChild(applyBtn);
    }
  } catch(e) {
    if (e.message !== 'session-expired') assistantDiv.textContent = 'Error: ' + e.message;
    else conversationHistory.pop(); // remove the user turn if session expired
  }

  document.getElementById('coach-btn').disabled = false;
  assistantDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function quick(q) {
  clearConversation();
  showPage('coach');
  askCoach(q);
}

function editUserContext() {
  const current = userContextMd
    ? `Here is the current version:\n\`\`\`\n${userContextMd}\n\`\`\``
    : `There is no user context yet — we need to create one from scratch.`;
  const q = `You are helping me set up or update my coaching context file. ${current}

Guide me through updating it. At minimum, confirm or update:
1. Training goals (priority order)
2. Primary tracking lifts (key compound movements)
3. Resistance training frequency (sessions/week)
4. Sport/cardio training types and frequency (sessions/week)

Ask any follow-up questions needed. Once all details are confirmed, output the complete updated file in exactly this format:
\`\`\`user-context
[full markdown here]
\`\`\``;
  clearConversation();
  closeSettings();
  showPage('coach');
  askCoach(q);
}

function tuneLoadings() {
  const casSessions = sessions.filter(s => (s.user || 'Cas') === 'Cas');
  const withKneeLoad = casSessions.filter(s =>
    !CARDIO_TYPES.includes(s.type) &&
    (s.exercises || []).some(e => {
      const entry = lookup.exercises[(e.name || '').toLowerCase().trim()];
      return entry && entry.strain_factor > 0;
    })
  ).slice(0, 4);

  if (!withKneeLoad.length) {
    clearConversation();
    showPage('coach');
    askCoach('There are no recent sessions with knee-loading exercises in my log. Can you help me decide what loading factors to set for exercises I plan to track?');
    return;
  }

  const breakdown = withKneeLoad.map(s => {
    const kps = s.kps ? ` | KPS ${s.kps.morning ?? '?'} → ${s.kps.post ?? '?'}` : '';
    const exLines = (s.exercises || []).flatMap(e => {
      const key = (e.name || '').toLowerCase().trim();
      const entry = lookup.exercises[key];
      if (!entry || !entry.strain_factor) return [];
      return (e.loading || '').split(',').map(p => p.trim()).filter(Boolean).map(part => {
        const sr = part.match(/^([\d.]+)\s*x\s*([\d.]+)/i);
        const w = part.match(/@\s*([\d.]+)/);
        const sets = sr ? parseFloat(sr[1]) : null;
        const reps = sr ? parseFloat(sr[2]) : null;
        const added = w ? parseFloat(w[1]) : 0;
        const weight = entry.bodyweight ? BODYWEIGHT_KG + added : added;
        const load = (sets && reps && weight)
          ? entry.strain_factor * weight * Math.log10(10 + sets * reps)
          : 0;
        return `  • ${e.name}  ${part}  →  ${load.toFixed(1)} (${impactLabel(load)})  [strain=${entry.strain_factor}${entry.bodyweight ? ' +BW' : ''}]`;
      });
    });
    return [`${s.date} | ${s.type}${kps}`, ...exLines].join('\n');
  }).join('\n\n');

  const q = `I want to tune the patellar loading factors for my exercises. The app computed the following loads for my recent sessions using the current strain factors (shown in brackets):\n\n${breakdown}\n\nFor each exercise, ask me whether the computed impact level matched my actual perceived knee strain. Go one session at a time, starting with the most recent. Based on my answers, suggest updated factors in this format:\n\`\`\`json\n{"type":"lookup-update","exercises":{"exercise name":{"strain_factor":X}}}\n\`\`\``;

  clearConversation();
  showPage('coach');
  askCoach(q);
}
