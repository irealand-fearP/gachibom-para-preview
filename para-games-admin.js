(() => {
  "use strict";

  const API_URL = "/api/para-games";
  const FALLBACK_URL = "data/jeju_para_games_2026.json";
  const form = document.getElementById("adminForm");
  const status = document.getElementById("adminStatus");
  const statusText = document.getElementById("adminStatusText");
  const statusIcon = status.querySelector("i");
  const token = document.getElementById("adminToken");
  const saveButton = document.getElementById("saveButton");
  const saveState = document.getElementById("saveState");
  const saveStateTitle = document.getElementById("saveStateTitle");
  const saveStateDetail = document.getElementById("saveStateDetail");
  const sportSelect = document.getElementById("sportSelect");
  const eventSelect = document.getElementById("eventSelect");
  const venueSelect = document.getElementById("venueSelect");
  const incidentSelect = document.getElementById("incidentSelect");
  const tabs = [...document.querySelectorAll("[data-admin-tab]")];
  const panels = [...document.querySelectorAll("[data-admin-panel]")];
  const eventEditorTitle = document.getElementById("eventEditorTitle");
  const eventContext = document.getElementById("eventContext");
  const venueEditorTitle = document.getElementById("venueEditorTitle");
  const venueContext = document.getElementById("venueContext");
  const noticePreview = document.getElementById("noticePreview");
  const noticePreviewState = document.getElementById("noticePreviewState");
  const noticePreviewTitle = document.getElementById("noticePreviewTitle");
  const noticePreviewDetail = document.getElementById("noticePreviewDetail");
  const noticePreviewSource = document.getElementById("noticePreviewSource");
  const noticePreviewMeta = document.getElementById("noticePreviewMeta");
  const officialSourceEditor = document.getElementById("officialSourceEditor");
  const incidentFields = document.getElementById("incidentFields");
  const incidentEmpty = document.getElementById("incidentEmpty");
  const addIncidentButton = document.getElementById("addIncidentButton");
  const deleteIncidentButton = document.getElementById("deleteIncidentButton");
  const operationsContext = document.getElementById("operationsContext");

  let data = null;
  let isDirty = false;
  let isSaving = false;
  let selectedIncidentIndex = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysUntil(fromDate, toDate) {
    const from = Date.parse(`${fromDate}T00:00:00Z`);
    const to = Date.parse(`${toDate}T00:00:00Z`);
    return Math.max(0, Math.round((to - from) / 86400000));
  }

  function sourceFreshness(source) {
    const ageDays = daysUntil(source.checked_at, currentLocalDate());
    const reviewEveryDays = source.review_every_days || 3;
    return {
      ageDays,
      reviewEveryDays,
      stale: ageDays >= reviewEveryDays,
      ageLabel: ageDays === 0 ? "오늘 확인" : `${ageDays}일 전 확인`
    };
  }

  function sourceDisplayStatus(source) {
    return source.status === "verified" && sourceFreshness(source).stale ? "stale" : source.status;
  }

  function sourceFreshnessLabel(source) {
    const freshness = sourceFreshness(source);
    const displayStatus = sourceDisplayStatus(source);
    const statusLabel = displayStatus === "verified" ? "확인 유효" : displayStatus === "unavailable" ? "접속 불가" : displayStatus === "stale" ? "갱신 필요" : "재확인 필요";
    return `${freshness.ageLabel} · ${freshness.reviewEveryDays}일 주기 · ${statusLabel}`;
  }

  function updateSourceCardState(card, source) {
    const displayStatus = sourceDisplayStatus(source);
    card.dataset.sourceStatus = displayStatus === "stale" ? "check_required" : displayStatus;
    const badge = card.querySelector(".source-freshness-badge");
    badge.dataset.kind = card.dataset.sourceStatus;
    badge.textContent = sourceFreshnessLabel(source);
  }

  function setStatus(message, kind = "") {
    statusText.textContent = message;
    status.dataset.kind = kind;
    statusIcon.className = kind === "error"
      ? "bi bi-exclamation-octagon-fill"
      : kind === "success"
        ? "bi bi-check-circle-fill"
        : "bi bi-info-circle-fill";
  }

  function updateSaveState() {
    saveState.dataset.dirty = String(isDirty);
    saveStateTitle.textContent = isDirty ? "저장되지 않은 변경 있음" : "변경 사항 없음";
    saveStateDetail.textContent = isDirty ? "확인 후 변경 내용을 저장하세요." : "필드를 수정하면 저장할 수 있습니다.";
    saveButton.disabled = !data || !isDirty || isSaving;
  }

  function setDirty(dirty) {
    isDirty = dirty;
    updateSaveState();
  }

  function selectTab(name, focus = false) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.adminTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        tab.focus();
      }
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== name;
    });
  }

  function fillSelect(select, items, label) {
    select.replaceChildren(...items.map((item, index) => new Option(label(item, index), String(index))));
  }

  function setControls(selector, source) {
    document.querySelectorAll(selector).forEach((control) => {
      const key = control.dataset.noticeField || control.dataset.eventField || control.dataset.venueField || control.dataset.incidentField;
      if (control.type === "checkbox") {
        control.checked = source[key] === true;
      } else if (control.dataset.listField) {
        control.value = Array.isArray(source[key]) ? source[key].join(", ") : "";
      } else {
        control.value = source[key] ?? "";
      }
    });
  }

  function selectedEvent() {
    return data.sports[Number(sportSelect.value)].events[Number(eventSelect.value)];
  }

  function selectedVenue() {
    return data.venues[Number(venueSelect.value)];
  }

  function selectedIncident() {
    return data.incidents[selectedIncidentIndex] || null;
  }

  function renderNotice() {
    setControls("[data-notice-field]", data.notices[0]);
    renderNoticePreview();
  }

  function renderNoticePreview() {
    const notice = data.notices[0];
    const urgent = notice.urgent === true;
    noticePreview.dataset.urgent = String(urgent);
    noticePreview.dataset.severity = notice.severity || "info";
    noticePreviewState.innerHTML = `<i class="bi ${urgent ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill"}" aria-hidden="true"></i> ${urgent ? "긴급 현장 안내" : "일반 안내"}`;
    noticePreviewTitle.textContent = notice.title || "공지 제목";
    noticePreviewDetail.textContent = notice.detail || "공지 내용이 여기에 표시됩니다.";
    const scopes = [
      notice.affected_venues?.length ? `경기장 ${notice.affected_venues.join(", ")}` : "",
      notice.affected_sports?.length ? `종목 ${notice.affected_sports.join(", ")}` : ""
    ].filter(Boolean);
    noticePreviewMeta.textContent = `${notice.published_on || "게시일 미정"}부터${notice.expires_on ? ` ${notice.expires_on}까지` : " 종료 공지 시까지"} · ${scopes.join(" · ") || "영향 범위 별도 확인"}`;
    noticePreviewSource.textContent = notice.source_title ? `공식 출처 · ${notice.source_title}` : "출처 확인 중";
    document.getElementById("noticeTabState").textContent = urgent ? "긴급" : "일반";
  }

  function renderEventList() {
    const events = data.sports[Number(sportSelect.value)].events;
    fillSelect(eventSelect, events, (event, index) => `${index + 1}. ${event.venue} · ${event.schedule_label}`);
    renderEvent();
  }

  function renderEvent() {
    setControls("[data-event-field]", selectedEvent());
    renderEventContext();
  }

  function renderEventContext() {
    const sport = data.sports[Number(sportSelect.value)];
    const event = selectedEvent();
    eventEditorTitle.textContent = sport.name;
    eventContext.textContent = `${event.venue} · ${event.schedule_label}`;
  }

  function renderVenue() {
    setControls("[data-venue-field]", selectedVenue());
    renderVenueContext();
  }

  function renderVenueContext() {
    const venue = selectedVenue();
    venueEditorTitle.textContent = venue.name;
    venueContext.textContent = `${venue.area} · ${venue.program}`;
  }

  function renderSourceEditor() {
    officialSourceEditor.innerHTML = data.official_sources.map((source, index) => {
      const displayStatus = sourceDisplayStatus(source);
      const cardStatus = displayStatus === "stale" ? "check_required" : displayStatus;
      return `
        <article class="source-editor-card" data-source-status="${escapeHtml(cardStatus)}">
          <header>
            <div><span>${escapeHtml(source.category)}</span><strong>${escapeHtml(source.title)}</strong></div>
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(source.title)} 공식 페이지, 새 창"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>
          </header>
          <p>${escapeHtml(source.description)}</p>
          <div class="source-check-row">
            <span class="source-freshness-badge" data-kind="${escapeHtml(cardStatus)}">${escapeHtml(sourceFreshnessLabel(source))}</span>
            <button class="source-verify-button" type="button" data-source-verify-index="${index}" title="공식 페이지 확인을 마친 뒤 확인일을 오늘로 변경합니다."><i class="bi bi-check2" aria-hidden="true"></i> 오늘 확인 처리</button>
          </div>
          <div class="source-editor-fields">
            <label for="officialSourceStatus${index}">확인 상태
              <select id="officialSourceStatus${index}" data-source-index="${index}" data-source-field="status">
                <option value="verified" ${source.status === "verified" ? "selected" : ""}>확인 완료</option>
                <option value="check_required" ${source.status === "check_required" ? "selected" : ""}>재확인 필요</option>
                <option value="unavailable" ${source.status === "unavailable" ? "selected" : ""}>접속 불가</option>
              </select>
            </label>
            <label for="officialSourceChecked${index}">마지막 확인일<input id="officialSourceChecked${index}" data-source-index="${index}" data-source-field="checked_at" type="date" value="${escapeHtml(source.checked_at)}" required></label>
            <label for="officialSourceInterval${index}">재확인 주기<input id="officialSourceInterval${index}" data-source-index="${index}" data-source-field="review_every_days" type="number" min="1" max="30" value="${source.review_every_days}" required><small class="field-help">1~30일</small></label>
            <label class="wide" for="officialSourceNote${index}">확인 메모<textarea id="officialSourceNote${index}" data-source-index="${index}" data-source-field="note" maxlength="1000" required>${escapeHtml(source.note)}</textarea></label>
          </div>
        </article>
      `;
    }).join("");
  }

  function incidentOptionLabel(incident, index) {
    const statusLabel = incident.status === "active" ? "공개 중" : incident.status === "resolved" ? "종료" : "초안";
    return `${index + 1}. ${incident.title} · ${statusLabel}`;
  }

  function renderIncidentList() {
    selectedIncidentIndex = Math.min(selectedIncidentIndex, Math.max(0, data.incidents.length - 1));
    if (data.incidents.length) {
      fillSelect(incidentSelect, data.incidents, incidentOptionLabel);
      incidentSelect.value = String(selectedIncidentIndex);
    } else {
      incidentSelect.replaceChildren(new Option("등록된 운영 이슈 없음", ""));
    }
    renderIncident();
  }

  function renderIncident() {
    const incident = selectedIncident();
    const hasIncident = Boolean(incident);
    incidentSelect.disabled = !hasIncident;
    deleteIncidentButton.disabled = !hasIncident;
    incidentEmpty.hidden = hasIncident;
    incidentFields.hidden = !hasIncident;
    incidentFields.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = !hasIncident;
    });
    if (incident) {
      setControls("[data-incident-field]", incident);
    }
    renderOperationsContext();
  }

  function renderOperationsContext() {
    const activeCount = data.incidents.filter((incident) => incident.status === "active").length;
    const sourceWarningCount = data.official_sources.filter((source) => sourceDisplayStatus(source) !== "verified").length;
    const incident = selectedIncident();
    operationsContext.textContent = incident
      ? `${incident.status === "active" ? "공개 중" : incident.status === "resolved" ? "종료" : "초안"} · ${incident.title}`
      : `공개 이슈 ${activeCount}건 · 공식정보 재확인 ${sourceWarningCount}곳`;
    document.getElementById("operationsTabCount").textContent = activeCount ? `이슈 ${activeCount}` : sourceWarningCount ? `확인 ${sourceWarningCount}` : "정상";
  }

  function renderSummary() {
    const eventCount = data.sports.reduce((sum, sport) => sum + sport.events.length, 0);
    document.getElementById("sportCount").textContent = data.sports.length;
    document.getElementById("eventCount").textContent = eventCount;
    document.getElementById("venueCount").textContent = data.venues.length;
    document.getElementById("scheduleTabCount").textContent = `${eventCount}건`;
    document.getElementById("venueTabCount").textContent = `${data.venues.length}곳`;
  }

  function renderAll() {
    renderSummary();
    renderNotice();
    fillSelect(sportSelect, data.sports, (sport) => sport.name);
    fillSelect(venueSelect, data.venues, (venue) => venue.name);
    renderEventList();
    renderVenue();
    renderSourceEditor();
    renderIncidentList();
  }

  function syncControl(control) {
    let source;
    let key;
    if (control.dataset.noticeField) {
      source = data.notices[0];
      key = control.dataset.noticeField;
    } else if (control.dataset.eventField) {
      source = selectedEvent();
      key = control.dataset.eventField;
    } else if (control.dataset.venueField) {
      source = selectedVenue();
      key = control.dataset.venueField;
    } else if (control.dataset.incidentField) {
      source = selectedIncident();
      key = control.dataset.incidentField;
    } else if (control.dataset.sourceField) {
      source = data.official_sources[Number(control.dataset.sourceIndex)];
      key = control.dataset.sourceField;
    } else {
      return false;
    }
    if (!source) {
      return false;
    }
    const value = control.dataset.listField
      ? control.value.split(",").map((item) => item.trim()).filter(Boolean)
      : control.type === "checkbox"
      ? control.checked
      : control.type === "number" && control.value !== ""
        ? Number(control.value)
        : control.value;
    if (Array.isArray(value) ? JSON.stringify(source[key] || []) === JSON.stringify(value) : source[key] === value) {
      return false;
    }
    source[key] = value;
    return true;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async function loadData() {
    try {
      data = await fetchJson(API_URL);
      setStatus("현재 공개 중인 정보를 불러왔습니다.", "success");
    } catch (error) {
      data = await fetchJson(FALLBACK_URL);
      setStatus("기본 데이터를 불러왔습니다. 서버 저장 기능이 연결되어야 변경 내용을 저장할 수 있습니다.");
    }
    if (!data?.notices?.length || !data?.sports?.length || !data?.venues?.length) {
      throw new Error("대회 데이터 형식이 올바르지 않습니다.");
    }
    data.official_sources = Array.isArray(data.official_sources) ? data.official_sources : [];
    data.official_sources.forEach((source) => {
      if (source && source.review_every_days == null) {
        source.review_every_days = 3;
      }
    });
    data.incidents = Array.isArray(data.incidents) ? data.incidents : [];
    const notice = data.notices[0];
    notice.urgent = notice.urgent === true;
    notice.severity = notice.severity || "info";
    notice.published_on = notice.published_on || data.updated_at;
    notice.expires_on = notice.expires_on || "";
    notice.affected_venues = Array.isArray(notice.affected_venues) ? notice.affected_venues : [];
    notice.affected_sports = Array.isArray(notice.affected_sports) ? notice.affected_sports : [];
    renderAll();
    form.setAttribute("aria-busy", "false");
    setDirty(false);
  }

  form.addEventListener("input", (event) => {
    if (!data || !syncControl(event.target)) {
      return;
    }
    setDirty(true);
    if (event.target.dataset.noticeField) {
      renderNoticePreview();
    } else if (event.target.dataset.eventField) {
      renderEventContext();
    } else if (event.target.dataset.venueField) {
      renderVenueContext();
    } else if (event.target.dataset.incidentField || event.target.dataset.sourceField) {
      if (event.target.dataset.sourceField) {
        updateSourceCardState(event.target.closest(".source-editor-card"), data.official_sources[Number(event.target.dataset.sourceIndex)]);
      }
      if (["title", "status"].includes(event.target.dataset.incidentField)) {
        incidentSelect.options[selectedIncidentIndex].textContent = incidentOptionLabel(selectedIncident(), selectedIncidentIndex);
      }
      renderOperationsContext();
    }
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.adminTab));
    tab.addEventListener("keydown", (event) => {
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!direction && event.key !== "Home" && event.key !== "End") {
        return;
      }
      event.preventDefault();
      const targetIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + direction + tabs.length) % tabs.length;
      selectTab(tabs[targetIndex].dataset.adminTab, true);
    });
  });

  sportSelect.addEventListener("change", renderEventList);
  eventSelect.addEventListener("change", renderEvent);
  venueSelect.addEventListener("change", renderVenue);
  incidentSelect.addEventListener("change", () => {
    selectedIncidentIndex = Number(incidentSelect.value);
    renderIncident();
  });

  officialSourceEditor.addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-verify-index]");
    if (!button) {
      return;
    }
    const index = Number(button.dataset.sourceVerifyIndex);
    const source = data.official_sources[index];
    source.status = "verified";
    source.checked_at = currentLocalDate();
    renderSourceEditor();
    renderOperationsContext();
    setDirty(true);
    officialSourceEditor.querySelector(`[data-source-verify-index="${index}"]`).focus();
  });

  addIncidentButton.addEventListener("click", () => {
    const id = `incident-${Date.now()}`;
    data.incidents.push({
      id,
      title: "새 운영 이슈",
      detail: "현장 영향과 방문자가 취해야 할 행동을 입력하세요.",
      severity: "warning",
      status: "draft",
      starts_on: currentLocalDate(),
      expires_on: "",
      affected_venues: [],
      affected_sports: [],
      source_title: "제46회 전국장애인체육대회 공식 홈페이지",
      source_url: "https://jejusports.kr/46/index.htm"
    });
    selectedIncidentIndex = data.incidents.length - 1;
    renderIncidentList();
    setDirty(true);
    document.getElementById("incidentTitle").focus();
  });

  deleteIncidentButton.addEventListener("click", () => {
    const incident = selectedIncident();
    if (!incident || !window.confirm(`‘${incident.title}’ 운영 이슈를 삭제할까요? 저장 전에는 공개 데이터에 반영되지 않습니다.`)) {
      return;
    }
    data.incidents.splice(selectedIncidentIndex, 1);
    selectedIncidentIndex = Math.max(0, selectedIncidentIndex - 1);
    renderIncidentList();
    setDirty(true);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!data || !form.reportValidity()) {
      return;
    }
    if (!token.value.trim()) {
      token.focus();
      setStatus("관리자 암호를 입력해 주세요.", "error");
      return;
    }

    isSaving = true;
    updateSaveState();
    form.setAttribute("aria-busy", "true");
    setStatus("변경 내용을 저장하고 있습니다.");
    try {
      const response = await fetch(API_URL, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token.value.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ data })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `저장 실패 (HTTP ${response.status})`);
      }
      data = result.data;
      renderAll();
      setDirty(false);
      setStatus(`저장했습니다. 정보 기준일 ${data.updated_at}`, "success");
    } catch (error) {
      setStatus(error.message || "저장하지 못했습니다.", "error");
    } finally {
      isSaving = false;
      form.setAttribute("aria-busy", "false");
      updateSaveState();
    }
  });

  loadData().catch(() => {
    setStatus("대회 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    form.setAttribute("aria-busy", "false");
    updateSaveState();
  });
})();
