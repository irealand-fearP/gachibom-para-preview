(() => {
  "use strict";

  const DATA_URLS = ["/api/para-games", "data/jeju_para_games_2026.json"];
  const FACILITY_API_URL = "/api/help-chat";
  const RESOURCE_TYPES = ["accessible_toilet", "power_wheelchair_fast_charger"];
  const venueList = document.getElementById("gamesVenueList");
  const venueDetail = document.getElementById("gamesVenueDetail");
  const venueSearch = document.getElementById("gamesVenueSearch");
  const eventStatus = document.getElementById("gamesEventStatus");
  const mySportForm = document.getElementById("gamesMySportForm");
  const mySportSearch = document.getElementById("gamesMySportSearch");
  const recentSports = document.getElementById("gamesRecentSports");
  const recentSportList = document.getElementById("gamesRecentSportList");
  const bottomFindButton = document.getElementById("gamesBottomFind");
  const updatedAt = document.getElementById("gamesUpdatedAt");
  const liveAlert = document.getElementById("gamesLiveAlert");
  const liveAlertTitle = document.getElementById("gamesLiveAlertTitle");
  const liveAlertDetail = document.getElementById("gamesLiveAlertDetail");
  const noticeTitle = document.getElementById("gamesNoticeTitle");
  const noticeDetail = document.getElementById("gamesNoticeDetail");
  const noticeActions = document.getElementById("gamesNoticeActions");
  const overviewContent = document.getElementById("gamesOverviewContent");
  const scheduleSearch = document.getElementById("gamesScheduleSearch");
  const scheduleScope = document.getElementById("gamesScheduleScope");
  const scheduleDisability = document.getElementById("gamesScheduleDisability");
  const scheduleCount = document.getElementById("gamesScheduleCount");
  const scheduleResults = document.getElementById("gamesScheduleResults");
  const scheduleLive = document.getElementById("gamesScheduleLive");
  const contactGrid = document.getElementById("gamesContactGrid");
  const operationsSummary = document.getElementById("gamesOperationsSummary");
  const incidentCount = document.getElementById("gamesIncidentCount");
  const incidentList = document.getElementById("gamesIncidentList");
  const officialSourceGrid = document.getElementById("gamesOfficialSourceGrid");
  const officialScheduleLink = document.getElementById("gamesOfficialScheduleLink");
  const noticeMeta = document.getElementById("gamesNoticeMeta");

  const RECENT_SPORTS_KEY = "gachibom.paraGames.recentSports";
  const RECENT_SPORTS_LIMIT = 5;
  // 달력 요일 머리글(일요일 시작)과 주말 색 구분에 쓴다.
  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const CALENDAR_CHIP_LIMIT = 3;
  // 하루 최대 34경기라 목록이 너무 길어져, 그날 목록은 한 페이지 5개씩 나눠 본다.
  const DAY_PANEL_PAGE_SIZE = 5;

  let pageData = null;
  let selectedVenueId = "";
  let selectedScheduleSportIndex = -1;
  let facilityRequest = null;
  let calendarMonth = "";          // 화면에 보이는 달 "YYYY-MM"
  let selectedScheduleDate = "";   // 달력에서 선택한 날 "YYYY-MM-DD"
  let scheduleMonthRange = null;   // 데이터에 존재하는 달의 최소·최대
  let dayPanelPage = 1;            // 그날 경기 목록의 현재 페이지(1부터)

  // 날짜를 새로 고르거나 검색·필터가 바뀌면 목록을 항상 첫 페이지부터 보여 준다.
  function resetDayPanelPage() {
    dayPanelPage = 1;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
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

  function formatReferenceDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return year && month && day ? `${year}. ${month}. ${day}.` : "확인 필요";
  }

  function mapUrl(item) {
    const latitude = Number(item?.latitude);
    const longitude = Number(item?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return "";
    }
    return `https://map.kakao.com/link/map/${encodeURIComponent(item.name || "경기장")},${latitude},${longitude}`;
  }

  function venueSearchUrl(event) {
    const query = `${event.location_scope === "jeju" ? "제주 " : ""}${event.venue}`;
    return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
  }

  // 데이터에 경기별 시작 시각이 없고 초안이라 계속 바뀌므로, 시각 스냅샷을 심는 대신
  // 항상 최신인 단일 공식 일정·결과 페이지 한 곳으로만 보낸다.
  // (종목별 연맹 URL 폴백은 탁구→농구연맹처럼 엉뚱한 곳으로 가는 오연결이 있어 제거했다.)
  const OFFICIAL_SCHEDULE_URL = "https://chg.koreanpc.kr/2026MSNPG/gmSchdlRslt/SprtsUnitGmSchdlRslt";

  function safeContactUrl(action) {
    const kind = String(action?.kind || "");
    const number = String(action?.value || "").replace(/\D/g, "");
    return ["tel", "sms"].includes(kind) && /^\d{3,11}$/.test(number) ? `${kind}:${number}` : "";
  }

  function flattenSchedule(data = pageData) {
    return data.sports.flatMap((sport, sportIndex) => sport.events.map((event) => ({
      ...event,
      sport_name: sport.name,
      sport_index: sportIndex
    })));
  }

  function validateData(data) {
    data.official_sources = Array.isArray(data?.official_sources) ? data.official_sources : [];
    data.incidents = Array.isArray(data?.incidents) ? data.incidents : [];
    data.official_sources.forEach((source) => {
      if (source && source.review_every_days == null) {
        source.review_every_days = 3;
      }
    });
    if (
      !data?.event
      || !Array.isArray(data.venues)
      || !data.venues.length
      || !Array.isArray(data.sports)
      || !Array.isArray(data.ceremonies)
      || !Array.isArray(data.contacts)
      || !Array.isArray(data.event.disability_types)
    ) {
      throw new Error("대회 데이터 형식이 올바르지 않습니다.");
    }
    const validVenues = data.venues.every((venue) => (
      venue?.id
      && venue?.name
      && Number(venue.latitude) >= 33
      && Number(venue.latitude) <= 34
      && Number(venue.longitude) >= 126
      && Number(venue.longitude) <= 127
      && safeHttpUrl(venue.source_url)
    ));
    if (!validVenues) {
      throw new Error("경기장 데이터에 확인이 필요한 항목이 있습니다.");
    }
    const validSports = data.sports.length === data.event.sports_count && data.sports.every((sport) => (
      sport?.name
      && Array.isArray(sport.events)
      && sport.events.length
      && sport.events.every((event) => (
        event?.venue
        && event?.schedule_label
        && /^\d{4}-\d{2}-\d{2}$/.test(event.start_date)
        && /^\d{4}-\d{2}-\d{2}$/.test(event.end_date)
        && event.start_date <= event.end_date
        && ["jeju", "off_island"].includes(event.location_scope)
      ))
    ));
    if (!validSports) {
      throw new Error("전체 경기 일정 데이터에 확인이 필요한 항목이 있습니다.");
    }
    const validContacts = data.contacts.every((contact) => (
      contact?.title
      && Array.isArray(contact.actions)
      && contact.actions.some((action) => safeContactUrl(action))
      && safeHttpUrl(contact.source_url)
    ));
    if (!validContacts) {
      throw new Error("현장 연락처 데이터에 확인이 필요한 항목이 있습니다.");
    }
    const validSources = data.official_sources.every((source) => (
      source?.id
      && source?.title
      && ["verified", "check_required", "unavailable"].includes(source.status)
      && /^\d{4}-\d{2}-\d{2}$/.test(source.checked_at)
      && Number.isInteger(source.review_every_days)
      && source.review_every_days >= 1
      && source.review_every_days <= 30
      && safeHttpUrl(source.url)
    ));
    const validIncidents = data.incidents.every((incident) => (
      incident?.id
      && incident?.title
      && incident?.detail
      && ["info", "warning", "critical"].includes(incident.severity)
      && ["draft", "active", "resolved"].includes(incident.status)
      && /^\d{4}-\d{2}-\d{2}$/.test(incident.starts_on)
      && (!incident.expires_on || /^\d{4}-\d{2}-\d{2}$/.test(incident.expires_on))
      && safeHttpUrl(incident.source_url)
    ));
    if (!validSources || !validIncidents) {
      throw new Error("운영 상태 데이터에 확인이 필요한 항목이 있습니다.");
    }
    return data;
  }

  function isCurrentItem(item, startKey) {
    const today = currentLocalDate();
    const startsOn = item?.[startKey] || "0000-01-01";
    return startsOn <= today && (!item?.expires_on || item.expires_on >= today);
  }

  function activeIncidents() {
    const priority = { critical: 0, warning: 1, info: 2 };
    return pageData.incidents
      .filter((incident) => incident.status === "active" && isCurrentItem(incident, "starts_on"))
      .sort((a, b) => priority[a.severity] - priority[b.severity]);
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

  function renderEventStatus() {
    const today = currentLocalDate();
    const { event } = pageData;
    const hasPreEvent = flattenSchedule().some((item) => item.start_date <= today && item.end_date >= today);
    if (today < event.start_date) {
      eventStatus.textContent = hasPreEvent ? "사전경기 진행 중" : `본대회 D-${daysUntil(today, event.start_date)}`;
    } else if (today <= event.end_date) {
      eventStatus.textContent = "대회 진행 중";
    } else {
      eventStatus.textContent = "대회 종료";
    }
  }

  // 최근 본 종목은 편의 기능이므로 저장소 접근이 막혀도 페이지가 멈추지 않게 방어한다.
  function readRecentSports() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_SPORTS_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((name) => typeof name === "string" && name.trim()).slice(0, RECENT_SPORTS_LIMIT) : [];
    } catch (error) {
      return [];
    }
  }

  function writeRecentSports(names) {
    try {
      window.localStorage.setItem(RECENT_SPORTS_KEY, JSON.stringify(names));
    } catch (error) {
      // 시크릿 모드나 저장 용량 초과 시에는 이번 방문에만 적용된다.
    }
  }

  function rememberSport(name) {
    const sportName = String(name || "").trim();
    if (!sportName) {
      return;
    }
    const next = [sportName, ...readRecentSports().filter((item) => item !== sportName)].slice(0, RECENT_SPORTS_LIMIT);
    writeRecentSports(next);
    renderRecentSports();
  }

  function renderRecentSports() {
    if (!recentSports || !recentSportList) {
      return;
    }
    const names = readRecentSports();
    recentSports.hidden = !names.length;
    recentSportList.innerHTML = names.map((name) => `
      <button class="games-recent-sport" type="button" data-recent-sport="${escapeHtml(name)}">
        <i class="bi bi-clock-history" aria-hidden="true"></i>
        <span>${escapeHtml(name)}</span>
        <span class="games-sr-only">종목 일정 보기</span>
      </button>
    `).join("");
  }

  // 히어로 검색은 전체 종목 일정 검색창과 값을 공유해 결과가 한 곳에서만 갱신되게 한다.
  function applyMySportQuery(query, { scroll = false, remember = false } = {}) {
    const keyword = String(query || "").trim();
    scheduleSearch.value = keyword;
    if (!pageData) {
      return;
    }
    resetDayPanelPage();
    const matchedSportIndex = pageData.sports.findIndex((sport) => normalizedText(sport.name).includes(normalizedText(keyword)));
    if (keyword && matchedSportIndex >= 0) {
      selectedScheduleSportIndex = matchedSportIndex;
      // 8월 사전경기 종목(사격 등)을 찾으면 달력도 그 종목의 첫 경기 달로 옮겨 준다.
      jumpCalendarToSport(matchedSportIndex);
    } else if (!keyword) {
      // 검색어를 지우면 강조와 달력 위치를 본대회 달로 되돌린다.
      selectedScheduleSportIndex = -1;
      calendarMonth = monthKeyOf(pageData.event.start_date);
      selectedScheduleDate = "";
    }
    renderSchedule();
    if (remember && keyword && matchedSportIndex >= 0) {
      rememberSport(pageData.sports[matchedSportIndex].name);
    }
    if (scroll) {
      focusScheduleSearch({ focusInput: false });
    }
  }

  // 하단 고정바·히어로에서 공통으로 쓰는 이동 동작
  function focusScheduleSearch({ focusInput = true } = {}) {
    document.getElementById("gamesSchedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focusInput) {
      scheduleSearch.focus({ preventScroll: true });
    }
  }

  function renderOverview() {
    const { event, ceremonies } = pageData;
    const sourceUrl = safeHttpUrl(event.source_url);
    overviewContent.innerHTML = `
      <div class="games-overview-layout">
        <div class="games-overview-facts">
          <dl>
            <div><dt>대회 기간</dt><dd>${escapeHtml(formatReferenceDate(event.start_date))}~${escapeHtml(formatReferenceDate(event.end_date).replace(/^\d{4}\. /, ""))}</dd></div>
            <div><dt>예상 참가</dt><dd>${escapeHtml(event.participants_label)}<small>${escapeHtml(event.athletes_label)} · ${escapeHtml(event.staff_label)}</small></dd></div>
            <div><dt>주최</dt><dd>${escapeHtml(event.host)}</dd></div>
            <div><dt>주관</dt><dd>${escapeHtml(event.organizers)}</dd></div>
          </dl>
          <div class="games-disability-types">
            <strong>참가 장애 유형 5개</strong>
            <div>${event.disability_types.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
          </div>
          <blockquote>${escapeHtml(event.slogan)}</blockquote>
        </div>
        <div class="games-ceremonies">
          <h3>개·폐회식</h3>
          ${ceremonies.map((item) => `
            <article class="games-ceremony ${item.status === "verify" ? "is-verify" : ""}">
              <div>
                <span>${escapeHtml(item.name)}</span>
                <time datetime="${escapeHtml(`${item.date}T${item.time}`)}">${escapeHtml(formatReferenceDate(item.date))} ${escapeHtml(item.time)}</time>
              </div>
              <strong>${escapeHtml(item.venue)}</strong>
              ${item.note ? `<p><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> ${escapeHtml(item.note)}</p>` : ""}
              ${item.venue_id ? `<a href="para-games.html?venue=${encodeURIComponent(item.venue_id)}#gamesFieldGuide">경기장 상세 보기 <i class="bi bi-arrow-right" aria-hidden="true"></i></a>` : ""}
            </article>
          `).join("")}
        </div>
      </div>
      <div class="games-guide-status">
        <i class="bi bi-shield-check" aria-hidden="true"></i>
        <p><strong>공식 자료 기준</strong>${escapeHtml(event.guide_status)}</p>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">참가요강 원문 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : ""}
      </div>
    `;
  }

  function normalizedText(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko");
  }

  function scheduleScopeLabel(sport) {
    const hasOffIsland = sport.events.some((event) => event.location_scope === "off_island");
    return hasOffIsland ? (sport.events.every((event) => event.location_scope === "off_island") ? "타 시도" : "제주·타 시도") : "제주";
  }

  // ── 달력 계산용 날짜 도우미 ─────────────────────────────────────────────
  function toIsoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function monthKeyOf(isoDate) {
    return String(isoDate || "").slice(0, 7);
  }

  function parseMonthKey(monthKey) {
    const [year, month] = String(monthKey).split("-").map(Number);
    return { year, month };
  }

  function shiftMonth(monthKey, step) {
    const { year, month } = parseMonthKey(monthKey);
    const shifted = new Date(Date.UTC(year, month - 1 + step, 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(monthKey) {
    const { year, month } = parseMonthKey(monthKey);
    return `${year}년 ${month}월`;
  }

  function daysInMonth(monthKey) {
    const { year, month } = parseMonthKey(monthKey);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function weekdayIndex(isoDate) {
    const [year, month, day] = String(isoDate).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function dayLabel(isoDate) {
    const [, month, day] = String(isoDate).split("-").map(Number);
    return `${month}월 ${day}일`;
  }

  // 시작일~종료일 사이의 모든 날짜를 훑는다(경기가 여러 날 이어지는 종목 처리).
  function eachDateInRange(startDate, endDate, callback) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate || startDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return;
    }
    const DAY_MS = 86400000;
    const totalDays = Math.min(Math.round((end - start) / DAY_MS), 366);
    for (let offset = 0; offset <= totalDays; offset += 1) {
      const current = new Date(start + offset * DAY_MS);
      callback(toIsoDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate()));
    }
  }

  // ── 장애 유형 필터 ──────────────────────────────────────────────────────
  // 데이터의 disability 표기가 "지체장애"·"지체·뇌병변"처럼 자유 문자열이라 키워드 부분일치로 판정한다.
  const DISABILITY_KEYWORDS = {
    "지체": ["지체"],
    "시각": ["시각"],
    "지적발달": ["지적", "발달"],
    "청각": ["청각"],
    "뇌병변": ["뇌병변"],
  };
  // "전종별"은 전 유형이 함께 출전하는 경기라 어떤 유형을 골라도 남긴다.
  const ALL_TYPES_LABEL = "전종별";

  function matchesDisability(disabilityText, selectedType) {
    if (selectedType === "all") {
      return true;
    }
    const text = String(disabilityText || "");
    if (text.includes(ALL_TYPES_LABEL)) {
      return true;
    }
    const keywords = DISABILITY_KEYWORDS[selectedType];
    return Array.isArray(keywords) && keywords.some((keyword) => text.includes(keyword));
  }

  // ── 일정 인덱스 ────────────────────────────────────────────────────────
  // 검색어·지역·장애 유형 필터를 모두(AND) 통과한 경기만 (종목, 경기) 쌍으로 펼친다.
  function filterScheduleEntries() {
    const query = normalizedText(scheduleSearch.value.trim());
    const selectedScope = scheduleScope.value;
    const selectedDisability = scheduleDisability ? scheduleDisability.value : "all";
    const entries = [];
    pageData.sports.forEach((sport, sportIndex) => {
      const sportMatches = !query || normalizedText(sport.name).includes(query);
      sport.events.forEach((event) => {
        const queryMatches = sportMatches || [event.division, event.disability, event.venue, event.schedule_label, event.preparation, event.scope_label]
          .some((value) => normalizedText(value).includes(query));
        const scopeMatches = selectedScope === "all" || event.location_scope === selectedScope;
        const disabilityMatches = matchesDisability(event.disability, selectedDisability);
        if (queryMatches && scopeMatches && disabilityMatches) {
          entries.push({ sportIndex, sportName: sport.name, event });
        }
      });
    });
    return entries;
  }

  // 날짜(YYYY-MM-DD) → 그날 열리는 경기 배열. 달력 뱃지·칩·선택일 목록이 모두 이 인덱스를 쓴다.
  function buildDateIndex(entries) {
    const index = new Map();
    entries.forEach((entry) => {
      eachDateInRange(entry.event.start_date, entry.event.end_date, (isoDate) => {
        if (!index.has(isoDate)) {
          index.set(isoDate, []);
        }
        index.get(isoDate).push(entry);
      });
    });
    // 좌측 종목 리스트와 같은 순서로 맞춰 칩·목록 순서가 헷갈리지 않게 한다.
    index.forEach((list) => list.sort((left, right) => left.sportIndex - right.sportIndex));
    return index;
  }

  // 좌측 종목 리스트용 요약(필터 통과 경기 기준).
  function summarizeSports(entries) {
    const summaries = new Map();
    entries.forEach((entry) => {
      if (!summaries.has(entry.sportIndex)) {
        summaries.set(entry.sportIndex, { sportIndex: entry.sportIndex, name: entry.sportName, events: [] });
      }
      summaries.get(entry.sportIndex).events.push(entry.event);
    });
    return [...summaries.values()].sort((left, right) => left.sportIndex - right.sportIndex);
  }

  // 데이터에 실제로 존재하는 달의 범위(8월 사전경기 ~ 9월 본대회)를 한 번만 계산한다.
  function ensureMonthRange() {
    if (scheduleMonthRange) {
      return scheduleMonthRange;
    }
    const allEvents = flattenSchedule();
    const startDates = allEvents.map((item) => item.start_date).filter(Boolean).sort();
    const endDates = allEvents.map((item) => item.end_date || item.start_date).filter(Boolean).sort();
    scheduleMonthRange = {
      first: monthKeyOf(startDates[0] || pageData.event.start_date),
      last: monthKeyOf(endDates[endDates.length - 1] || pageData.event.end_date),
    };
    return scheduleMonthRange;
  }

  // 사전경기가 있는 달 중 가장 이른 달(핀 버튼 목적지)과 그 종목 이름들.
  function preEventSummary() {
    const range = ensureMonthRange();
    const mainMonth = monthKeyOf(pageData.event.start_date);
    if (range.first === mainMonth) {
      return null;
    }
    const names = new Set();
    pageData.sports.forEach((sport) => {
      sport.events.forEach((event) => {
        if (monthKeyOf(event.start_date) === range.first) {
          names.add(sport.name);
        }
      });
    });
    const { month } = parseMonthKey(range.first);
    return { monthKey: range.first, month, names: [...names] };
  }

  function clampMonth(monthKey) {
    const range = ensureMonthRange();
    if (monthKey < range.first) {
      return range.first;
    }
    if (monthKey > range.last) {
      return range.last;
    }
    return monthKey;
  }

  // 보이는 달과 선택한 날짜를 항상 유효한 값으로 맞춘다(필터로 경기가 사라진 경우 포함).
  function ensureCalendarSelection(dateIndex) {
    if (!calendarMonth) {
      calendarMonth = monthKeyOf(pageData.event.start_date);
    }
    calendarMonth = clampMonth(calendarMonth);

    const monthDates = [...dateIndex.keys()].filter((isoDate) => monthKeyOf(isoDate) === calendarMonth).sort();
    if (selectedScheduleDate && monthKeyOf(selectedScheduleDate) === calendarMonth && dateIndex.has(selectedScheduleDate)) {
      return monthDates;
    }
    const today = currentLocalDate();
    const eventStart = pageData.event.start_date;
    const nextDate = [today, eventStart].find((candidate) => monthDates.includes(candidate)) || monthDates[0] || "";
    if (nextDate !== selectedScheduleDate) {
      // 필터·달 이동으로 선택 날짜가 자동으로 바뀐 경우에도 첫 페이지부터 다시 본다.
      resetDayPanelPage();
    }
    selectedScheduleDate = nextDate;
    return monthDates;
  }

  // 종목을 고르면 그 종목의 첫 경기가 있는 달로 달력을 옮긴다.
  function jumpCalendarToSport(sportIndex) {
    const sport = pageData?.sports?.[sportIndex];
    if (!sport?.events?.length) {
      return;
    }
    const firstDate = sport.events.map((event) => event.start_date).filter(Boolean).sort()[0];
    if (!firstDate) {
      return;
    }
    calendarMonth = clampMonth(monthKeyOf(firstDate));
    selectedScheduleDate = firstDate;
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────
  function calendarChipMarkup(entry) {
    const isOffIsland = entry.event.location_scope === "off_island";
    return `
      <span class="games-cal-chip ${isOffIsland ? "is-off-island" : ""}">
        <b>${escapeHtml(entry.sportName)}</b>
        <small>${escapeHtml(entry.event.venue)}</small>
      </span>
    `;
  }

  function calendarCellMarkup(isoDate, entries) {
    const day = Number(isoDate.slice(8, 10));
    const weekday = weekdayIndex(isoDate);
    const weekendClass = weekday === 0 ? "is-sunday" : (weekday === 6 ? "is-saturday" : "");
    if (!entries.length) {
      return `<div class="games-cal-cell is-empty ${weekendClass}" role="gridcell"><span class="games-cal-day">${day}</span></div>`;
    }
    const isSelected = isoDate === selectedScheduleDate;
    const hasSelectedSport = selectedScheduleSportIndex >= 0 && entries.some((entry) => entry.sportIndex === selectedScheduleSportIndex);
    const shown = entries.slice(0, CALENDAR_CHIP_LIMIT);
    const restCount = entries.length - shown.length;
    const sportHitLabel = hasSelectedSport ? `, ${pageData.sports[selectedScheduleSportIndex].name} 경기일` : "";
    return `
      <button class="games-cal-cell is-active ${weekendClass} ${isSelected ? "is-selected" : ""} ${hasSelectedSport ? "is-sport-hit" : ""}"
        type="button" role="gridcell" aria-selected="${isSelected}" data-schedule-date="${isoDate}"
        aria-label="${dayLabel(isoDate)} ${entries.length}경기${sportHitLabel}">
        <span class="games-cal-head">
          <span class="games-cal-day">${day}</span>
          <span class="games-cal-count">${entries.length}</span>
        </span>
        <span class="games-cal-chips">
          ${shown.map(calendarChipMarkup).join("")}
          ${restCount > 0 ? `<span class="games-cal-more">+${restCount}경기 더</span>` : ""}
        </span>
      </button>
    `;
  }

  function calendarMarkup(dateIndex) {
    const range = ensureMonthRange();
    const totalDays = daysInMonth(calendarMonth);
    const firstWeekday = weekdayIndex(`${calendarMonth}-01`);
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push('<div class="games-cal-cell is-pad" role="gridcell" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const isoDate = `${calendarMonth}-${String(day).padStart(2, "0")}`;
      cells.push(calendarCellMarkup(isoDate, dateIndex.get(isoDate) || []));
    }
    while (cells.length % 7 !== 0) {
      cells.push('<div class="games-cal-cell is-pad" role="gridcell" aria-hidden="true"></div>');
    }
    const rows = [];
    for (let start = 0; start < cells.length; start += 7) {
      rows.push(`<div class="games-cal-row" role="row">${cells.slice(start, start + 7).join("")}</div>`);
    }

    const preEvent = preEventSummary();
    const preEventPin = preEvent && preEvent.monthKey !== calendarMonth
      ? `<button class="games-calendar-pre" type="button" data-goto-month="${preEvent.monthKey}">${preEvent.month}월 사전경기 ${preEvent.names.length}종목(${escapeHtml(preEvent.names.join("·"))}) →</button>`
      : "";

    return `
      <div class="games-calendar-panel">
        <div class="games-calendar-bar">
          <button class="games-calendar-nav" type="button" data-month-step="-1" ${calendarMonth <= range.first ? "disabled" : ""} aria-label="이전 달 보기">
            <i class="bi bi-chevron-left" aria-hidden="true"></i>
          </button>
          <h3 class="games-calendar-title" id="gamesCalendarTitle">${monthLabel(calendarMonth)}</h3>
          <button class="games-calendar-nav" type="button" data-month-step="1" ${calendarMonth >= range.last ? "disabled" : ""} aria-label="다음 달 보기">
            <i class="bi bi-chevron-right" aria-hidden="true"></i>
          </button>
          ${preEventPin}
        </div>
        <div class="games-calendar-weekdays" aria-hidden="true">
          ${WEEKDAY_LABELS.map((label, index) => `<span class="${index === 0 ? "is-sunday" : (index === 6 ? "is-saturday" : "")}">${label}</span>`).join("")}
        </div>
        <div class="games-calendar-grid" role="grid" aria-labelledby="gamesCalendarTitle">
          ${rows.join("")}
        </div>
        <div class="games-calendar-legend">
          <span class="games-legend-scope"><i class="games-legend-dot is-jeju" aria-hidden="true"></i>제주 경기장</span>
          <span class="games-legend-scope"><i class="games-legend-dot is-off-island" aria-hidden="true"></i>타 시도 경기장</span>
          <span><i class="games-legend-dot is-selected" aria-hidden="true"></i>선택한 날짜</span>
          <small>칸 우측 숫자 = 그날 경기 수 · 날짜를 누르면 그날 전체 목록</small>
        </div>
      </div>
    `;
  }

  // 선택한 날짜의 경기 한 줄. 기존 일정 행 구조를 그대로 재사용한다(경기 시각 안내 포함).
  function scheduleRowMarkup(entry) {
    const { event, sportName } = entry;
    const mapSearchUrl = venueSearchUrl(event);
    const detailUrl = event.detail_venue_id ? `para-games.html?venue=${encodeURIComponent(event.detail_venue_id)}#gamesFieldGuide` : "";
    const timeNote = `<a href="${escapeHtml(OFFICIAL_SCHEDULE_URL)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(sportName)} 경기 시각은 공식 일정에서 확인, 새 창">경기 시각은 공식 일정에서 확인 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`;
    const divisionText = [event.division, event.disability].filter(Boolean).join(" · ");
    return `
      <div class="games-schedule-row ${event.location_scope === "off_island" ? "is-off-island" : ""}" role="listitem">
        <div class="games-schedule-division"><span>${escapeHtml(sportName)}</span><small>${escapeHtml(divisionText)}</small></div>
        <div class="games-schedule-date"><strong>${escapeHtml(event.schedule_label)}</strong>${event.preparation ? `<small>${escapeHtml(event.preparation)}</small>` : ""}</div>
        <div class="games-schedule-venue">
          <span>${event.location_scope === "off_island" ? `타 시도 · ${escapeHtml(event.scope_label || "")}` : "제주"}</span>
          <strong>${escapeHtml(event.venue)}</strong>
        </div>
        <div class="games-schedule-actions">
          <a href="${escapeHtml(mapSearchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(event.venue)} 지도 검색, 새 창"><i class="bi bi-geo-alt" aria-hidden="true"></i> 지도 검색</a>
          ${detailUrl ? `<a href="${escapeHtml(detailUrl)}"><i class="bi bi-universal-access" aria-hidden="true"></i> 접근 상세</a>` : ""}
        </div>
        <p class="games-schedule-time-note"><i class="bi bi-clock" aria-hidden="true"></i> ${timeNote}</p>
      </div>
    `;
  }

  function dayPanelMarkup(dateIndex) {
    if (!selectedScheduleDate) {
      return `
        <section class="games-day-panel" id="gamesDayPanel" aria-live="polite">
          <p class="games-empty">이 달에는 조건에 맞는 경기가 없습니다. 달을 옮기거나 검색어를 지워 보세요.</p>
        </section>
      `;
    }
    const entries = dateIndex.get(selectedScheduleDate) || [];
    const weekday = WEEKDAY_LABELS[weekdayIndex(selectedScheduleDate)];
    const page = clampDayPanelPage(entries.length);
    dayPanelPage = page;
    const totalPages = dayPanelTotalPages(entries.length);
    const startIndex = (page - 1) * DAY_PANEL_PAGE_SIZE;
    const pageEntries = entries.slice(startIndex, startIndex + DAY_PANEL_PAGE_SIZE);
    const rangeLabel = dayPanelRangeLabel(entries.length);
    // 경기가 한 페이지에 다 들어가면 컨트롤을 그리지 않는다(불필요한 버튼 노출 방지).
    const pager = totalPages <= 1 ? "" : `
        <nav class="games-day-pager" aria-label="그날 경기 목록 페이지 이동">
          <button class="games-day-pager-btn" type="button" data-day-page-step="-1"
            aria-label="이전 ${DAY_PANEL_PAGE_SIZE}경기 보기" ${page <= 1 ? "disabled" : ""}>
            <i class="bi bi-chevron-left" aria-hidden="true"></i> 이전
          </button>
          <span class="games-day-pager-status">${rangeLabel} · ${page} / ${totalPages}페이지</span>
          <button class="games-day-pager-btn" type="button" data-day-page-step="1"
            aria-label="다음 ${DAY_PANEL_PAGE_SIZE}경기 보기" ${page >= totalPages ? "disabled" : ""}>
            다음 <i class="bi bi-chevron-right" aria-hidden="true"></i>
          </button>
        </nav>`;
    return `
      <section class="games-day-panel" id="gamesDayPanel" aria-live="polite" aria-labelledby="gamesDayPanelTitle">
        <header class="games-day-panel-head">
          <h3 id="gamesDayPanelTitle">${dayLabel(selectedScheduleDate)} <span>${weekday}요일</span></h3>
          <strong>${entries.length}경기</strong>
        </header>
        <div class="games-sport-events" role="list">
          ${pageEntries.map(scheduleRowMarkup).join("")}
        </div>
        ${pager}
      </section>
    `;
  }

  function dayPanelTotalPages(totalCount) {
    return Math.max(1, Math.ceil(totalCount / DAY_PANEL_PAGE_SIZE));
  }

  // 필터로 경기 수가 줄어도 페이지 번호가 범위를 벗어나지 않게 잡아 준다.
  function clampDayPanelPage(totalCount) {
    return Math.min(Math.max(1, dayPanelPage), dayPanelTotalPages(totalCount));
  }

  // "1–5 / 전체 34경기" 형태의 현재 위치 표시.
  function dayPanelRangeLabel(totalCount) {
    if (!totalCount) {
      return "0 / 전체 0경기";
    }
    const start = (clampDayPanelPage(totalCount) - 1) * DAY_PANEL_PAGE_SIZE + 1;
    const end = Math.min(start + DAY_PANEL_PAGE_SIZE - 1, totalCount);
    return `${start}–${end} / 전체 ${totalCount}경기`;
  }

  // 페이지 이동은 달력까지 다시 그릴 필요가 없어 그날 목록 노드만 교체한다.
  function renderDayPanelOnly() {
    const panel = scheduleResults.querySelector("#gamesDayPanel");
    if (!panel) {
      renderSchedule();
      return;
    }
    const dateIndex = buildDateIndex(filterScheduleEntries());
    panel.outerHTML = dayPanelMarkup(dateIndex);
    const total = dateIndex.get(selectedScheduleDate)?.length || 0;
    if (scheduleLive) {
      scheduleLive.textContent = `${dayLabel(selectedScheduleDate)} ${dayPanelRangeLabel(total)}를 표시했습니다.`;
    }
  }

  function renderSchedule({ focusSelectedDate = false } = {}) {
    const entries = filterScheduleEntries();
    const sportSummaries = summarizeSports(entries);
    scheduleCount.textContent = `${sportSummaries.length}개 종목 · ${entries.length}개 경기장 항목`;

    if (!entries.length) {
      scheduleResults.innerHTML = '<p class="games-empty">조건에 맞는 경기 일정이 없습니다.</p>';
      return;
    }

    const dateIndex = buildDateIndex(entries);
    ensureCalendarSelection(dateIndex);
    const activeSportExists = sportSummaries.some((sport) => sport.sportIndex === selectedScheduleSportIndex);
    if (!activeSportExists) {
      selectedScheduleSportIndex = -1;
    }

    scheduleResults.innerHTML = `
      <label class="games-sport-select" for="gamesSportSelect">
        <span>종목으로 달력 보기</span>
        <select id="gamesSportSelect" aria-describedby="gamesScheduleCount">
          <option value="-1" ${selectedScheduleSportIndex < 0 ? "selected" : ""}>전체 종목</option>
          ${sportSummaries.map((sport) => `<option value="${sport.sportIndex}" ${sport.sportIndex === selectedScheduleSportIndex ? "selected" : ""}>${escapeHtml(sport.name)} · ${sport.events.length}개 일정</option>`).join("")}
        </select>
      </label>
      <div class="games-schedule-browser">
        <nav class="games-sport-index" aria-label="종목 선택">
          <div class="games-sport-index-head"><strong>종목 선택</strong><span>${sportSummaries.length}개</span></div>
          <div class="games-sport-index-list">
            <button class="games-sport-button is-all ${selectedScheduleSportIndex < 0 ? "is-active" : ""}" type="button" data-sport-index="-1" aria-pressed="${selectedScheduleSportIndex < 0}">
              <span><i class="bi bi-grid" aria-hidden="true"></i></span>
              <strong>전체 종목</strong>
              <small>달력에 모든 경기 표시</small>
            </button>
            ${sportSummaries.map((sport) => `
              <button class="games-sport-button ${sport.sportIndex === selectedScheduleSportIndex ? "is-active" : ""}" type="button" data-sport-index="${sport.sportIndex}" aria-pressed="${sport.sportIndex === selectedScheduleSportIndex}">
                <span>${String(sport.sportIndex + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(sport.name)}</strong>
                <small>${sport.events.length}개 일정 · ${escapeHtml(scheduleScopeLabel(sport))}</small>
              </button>
            `).join("")}
          </div>
        </nav>
        <div class="games-calendar-pane">
          ${calendarMarkup(dateIndex)}
          ${dayPanelMarkup(dateIndex)}
        </div>
      </div>
    `;

    if (focusSelectedDate && selectedScheduleDate) {
      scheduleResults.querySelector(`[data-schedule-date="${selectedScheduleDate}"]`)?.focus();
    }
  }

  // 선택한 날짜가 바뀐 것을 스크린리더에도 알린다.
  function announceSelectedDate(count) {
    if (!scheduleLive || !selectedScheduleDate) {
      return;
    }
    scheduleLive.textContent = `${dayLabel(selectedScheduleDate)} ${count}경기 목록을 표시했습니다.`;
  }

  function renderContacts() {
    contactGrid.innerHTML = pageData.contacts.map((contact) => {
      const sourceUrl = safeHttpUrl(contact.source_url);
      return `
        <article class="games-contact-card ${contact.priority === "emergency" ? "is-emergency" : ""}">
          <span>${escapeHtml(contact.category)}</span>
          <h3>${escapeHtml(contact.title)}</h3>
          <strong>${escapeHtml(contact.hours)}</strong>
          <p>${escapeHtml(contact.detail)}</p>
          <div class="games-contact-actions">
            ${contact.actions.map((action) => {
              const url = safeContactUrl(action);
              const icon = action.kind === "sms" ? "bi-chat-text" : "bi-telephone";
              return url ? `<a href="${escapeHtml(url)}"><i class="bi ${icon}" aria-hidden="true"></i> ${escapeHtml(action.label)}</a>` : "";
            }).join("")}
          </div>
          ${sourceUrl ? `<a class="games-contact-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 안내 확인 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : ""}
        </article>
      `;
    }).join("");
  }

  function affectedScope(item) {
    const labels = [];
    if (item.affected_venues?.length) {
      labels.push(`경기장 ${item.affected_venues.join(", ")}`);
    }
    if (item.affected_sports?.length) {
      labels.push(`종목 ${item.affected_sports.join(", ")}`);
    }
    return labels.join(" · ") || "영향 범위 별도 확인";
  }

  function renderOperations() {
    const incidents = activeIncidents();
    const sourceWarnings = pageData.official_sources.filter((source) => sourceDisplayStatus(source) !== "verified");
    const hasCritical = incidents.some((incident) => incident.severity === "critical");
    const summaryTitle = hasCritical
      ? "즉시 확인이 필요한 현장 이슈가 있습니다."
      : incidents.length
        ? `진행 중 운영 이슈 ${incidents.length}건이 있습니다.`
        : sourceWarnings.length
          ? `공식 정보 ${sourceWarnings.length}곳은 재확인이 필요합니다.`
          : "공식 정보 확인 상태가 최신입니다.";
    const summaryDetail = sourceWarnings.length
      ? "이동 전에 확인 주기와 공식 원문을 함께 확인해 주세요."
      : incidents.length
        ? "아래 영향 범위와 공식 출처를 확인해 주세요."
        : "공식 원문은 이동 직전에 한 번 더 확인해 주세요.";
    operationsSummary.dataset.kind = hasCritical ? "critical" : incidents.length || sourceWarnings.length ? "warning" : "clear";
    operationsSummary.innerHTML = `
      <i class="bi ${hasCritical ? "bi-exclamation-octagon-fill" : incidents.length || sourceWarnings.length ? "bi-exclamation-triangle-fill" : "bi-check-circle-fill"}" aria-hidden="true"></i>
      <div>
        <strong>${summaryTitle}</strong>
        <span>${summaryDetail}</span>
      </div>
    `;

    incidentCount.textContent = incidents.length ? `${incidents.length}건 진행 중` : "등록 이슈 없음";
    incidentList.innerHTML = incidents.length ? incidents.map((incident) => {
      const sourceUrl = safeHttpUrl(incident.source_url);
      const severityLabel = incident.severity === "critical" ? "긴급" : incident.severity === "warning" ? "주의" : "안내";
      const period = `${formatReferenceDate(incident.starts_on)}부터${incident.expires_on ? ` ${formatReferenceDate(incident.expires_on)}까지` : " 종료 공지 시까지"}`;
      return `
        <article class="games-incident-card" data-severity="${escapeHtml(incident.severity)}">
          <div class="games-incident-head"><span>${severityLabel}</span><small>${escapeHtml(period)}</small></div>
          <h4>${escapeHtml(incident.title)}</h4>
          <p>${escapeHtml(incident.detail)}</p>
          <strong><i class="bi bi-bullseye" aria-hidden="true"></i> ${escapeHtml(affectedScope(incident))}</strong>
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(incident.source_title)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : ""}
        </article>
      `;
    }).join("") : `
      <div class="games-no-incident">
        <i class="bi bi-check2-circle" aria-hidden="true"></i>
        <div><strong>현재 등록된 운영 이슈 없음</strong><p>새 공지가 등록될 수 있으므로 이동 직전에 다시 확인하세요.</p></div>
      </div>
    `;

    officialSourceGrid.innerHTML = pageData.official_sources.length ? pageData.official_sources.map((source) => {
      const sourceUrl = safeHttpUrl(source.url);
      const freshness = sourceFreshness(source);
      const displayStatus = sourceDisplayStatus(source);
      const cardStatus = displayStatus === "stale" ? "check_required" : displayStatus;
      const statusLabel = displayStatus === "verified" ? "확인 완료" : displayStatus === "unavailable" ? "접속 불가" : displayStatus === "stale" ? "갱신 필요" : "재확인 필요";
      const statusIcon = displayStatus === "verified" ? "bi-check-circle-fill" : displayStatus === "unavailable" ? "bi-x-octagon-fill" : "bi-exclamation-circle-fill";
      return `
        <article class="games-source-card" data-status="${escapeHtml(cardStatus)}">
          <div class="games-source-card-head"><span>${escapeHtml(source.category)}</span><b><i class="bi ${statusIcon}" aria-hidden="true"></i> ${statusLabel}</b></div>
          <h4>${escapeHtml(source.title)}</h4>
          <p>${escapeHtml(source.description)}</p>
          <small>확인일 ${escapeHtml(formatReferenceDate(source.checked_at))} · ${escapeHtml(freshness.ageLabel)} · ${freshness.reviewEveryDays}일 주기</small>
          <em>${escapeHtml(source.note)}</em>
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 페이지 열기 <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>` : ""}
        </article>
      `;
    }).join("") : '<p class="games-empty">연결된 공식 정보가 없습니다. 대회 공식 홈페이지를 확인해 주세요.</p>';

    const scheduleSource = pageData.official_sources.find((source) => source.id === "schedule-results");
    const scheduleUrl = safeHttpUrl(scheduleSource?.url);
    if (scheduleUrl) {
      officialScheduleLink.href = scheduleUrl;
      officialScheduleLink.hidden = false;
    } else {
      officialScheduleLink.hidden = true;
    }
  }

  function renderNotices() {
    const notice = pageData.notices?.find((item) => isCurrentItem(item, "published_on")) || pageData.notices?.[0];
    const currentNotice = notice && isCurrentItem(notice, "published_on");
    const featuredIncident = activeIncidents()[0];
    noticeTitle.textContent = notice?.title || "일정은 출발 전에 다시 확인하세요";
    noticeDetail.textContent = notice?.detail || "종목별 경기단체 공지와 현장 운영 안내가 가장 최신일 수 있습니다.";
    noticeMeta.textContent = notice
      ? `${currentNotice ? "게시 중" : "게시 기간 종료"} · ${affectedScope(notice)}${notice.expires_on ? ` · ${formatReferenceDate(notice.expires_on)}까지` : ""}`
      : "";
    const featuredNotice = currentNotice && notice?.urgent === true ? notice : null;
    const featured = featuredIncident || featuredNotice;
    liveAlert.hidden = !featured;
    if (featured) {
      liveAlert.dataset.severity = featured.severity || "warning";
      liveAlertTitle.textContent = featured.title;
      liveAlertDetail.textContent = featured.detail;
    }
    const links = [
      { title: pageData.event.source_title, url: pageData.event.source_url },
      notice && { title: notice.source_title, url: notice.source_url }
    ].filter(Boolean);
    noticeActions.innerHTML = links.map((link) => {
      const url = safeHttpUrl(link.url);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : "";
    }).join("");
  }

  function renderVenueList(query = "") {
    const normalized = query.trim().toLocaleLowerCase("ko");
    const venues = pageData.venues.filter((venue) => (
      !normalized
      || [venue.name, venue.program, venue.area].some((value) => String(value).toLocaleLowerCase("ko").includes(normalized))
    ));

    if (!venues.length) {
      venueList.innerHTML = '<p class="games-empty">조건에 맞는 경기장이 없습니다.</p>';
      return;
    }

    venueList.innerHTML = venues.map((venue) => `
      <button class="games-venue-button" type="button" data-venue-id="${escapeHtml(venue.id)}" aria-current="${venue.id === selectedVenueId}">
        <span>${escapeHtml(venue.program)} · ${escapeHtml(venue.phase)}</span>
        <small class="games-venue-area">${escapeHtml(venue.area)}</small>
        <strong>${escapeHtml(venue.name)}</strong>
        <small>${escapeHtml(venue.schedule_label)}</small>
      </button>
    `).join("");
  }

  function renderVenueDetail(venue) {
    const officialUrl = safeHttpUrl(venue.source_url);
    const venueMapUrl = mapUrl(venue);
    venueDetail.innerHTML = `
      <header class="games-detail-head">
        <div>
          <span class="games-phase-badge">${escapeHtml(venue.phase)}</span>
          <h2>${escapeHtml(venue.name)}</h2>
          <p>${escapeHtml(venue.address)}</p>
        </div>
        <div class="games-detail-actions">
          <a href="${escapeHtml(venueMapUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-map" aria-hidden="true"></i> 카카오맵 열기</a>
          <a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-check2-circle" aria-hidden="true"></i> 공식 일정 확인</a>
        </div>
      </header>
      <div class="games-detail-body">
        <dl class="games-venue-facts">
          <div><dt>경기·행사</dt><dd>${escapeHtml(venue.program)}</dd></div>
          <div><dt>확인 일정</dt><dd>${escapeHtml(venue.schedule_label)}</dd></div>
          <div><dt>지역</dt><dd>${escapeHtml(venue.area)}</dd></div>
        </dl>

        <section class="games-section" aria-labelledby="gamesAccessTitle">
          <div class="games-section-head">
            <h3 id="gamesAccessTitle">현장 접근 정보</h3>
            <p>확인되지 않은 동선은 임의로 안내하지 않습니다.</p>
          </div>
          <div class="games-access-grid">
            <div class="games-access-card"><i class="bi bi-universal-access-circle" aria-hidden="true"></i><strong>휠체어 출입구</strong><span>현장 확인 필요</span></div>
            <div class="games-access-card"><i class="bi bi-car-front" aria-hidden="true"></i><strong>승하차 구역</strong><span>현장 확인 필요</span></div>
            <div class="games-access-card"><i class="bi bi-bus-front" aria-hidden="true"></i><strong>셔틀·저상버스</strong><span>공식 수송 계획 확인 필요</span></div>
          </div>
          <p class="games-access-note">${escapeHtml(venue.accessibility_note)}</p>
        </section>

        <section class="games-section" aria-labelledby="gamesFacilityTitle">
          <div class="games-section-head">
            <h3 id="gamesFacilityTitle">경기장 주변 접근성 시설</h3>
            <p>경기장 좌표 기준 직선거리 · 실제 이동 경로와 다를 수 있음</p>
          </div>
          <div id="gamesFacilityResults"><p class="games-facility-status">공식 시설 데이터를 확인하고 있습니다.</p></div>
        </section>

        <a class="games-after-link" href="index.html?intro=0#conceptPage">
          <div><span>경기 관람 전후</span><strong>접근성 조건에 맞는 제주 여행 찾기</strong></div>
          <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </a>
      </div>
    `;
  }

  function formatDistance(item) {
    const meters = Number(item?.distance_meters);
    if (!Number.isFinite(meters) || meters < 0) {
      return "거리 확인 필요";
    }
    return meters < 1000 ? `${Math.max(1, Math.round(meters))}m` : `${(meters / 1000).toFixed(1)}km`;
  }

  function renderFacilityResults(payload) {
    const target = document.getElementById("gamesFacilityResults");
    if (!target) {
      return;
    }
    const results = Array.isArray(payload?.nearby_results) ? payload.nearby_results.slice(0, 4) : [];
    if (!results.length) {
      target.innerHTML = '<p class="games-facility-status">표시할 공식 시설 결과가 없습니다. 현장 운영본부에 확인해 주세요.</p>';
      return;
    }

    target.innerHTML = `
      <div class="games-facility-list">
        ${results.map((item) => {
          const facilityMapUrl = mapUrl(item);
          const sourceUrl = safeHttpUrl(item.source_url);
          const label = item.resource_label || (item.resource_type === "power_wheelchair_fast_charger" ? "전동휠체어 급속충전기" : "장애인 화장실");
          return `
            <article class="games-facility-card">
              <div class="games-facility-card-head">
                <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(item.name || "시설명 확인 필요")}</strong></div>
                <b class="games-facility-distance">${escapeHtml(formatDistance(item))}</b>
              </div>
              <p>${escapeHtml(item.address || item.detail || item.accessibility_note || "세부 정보 확인 필요")}</p>
              <p class="games-facility-meta">공식 자료 · 정보 기준 ${escapeHtml(item.checked_at || "확인 필요")}</p>
              <div class="games-facility-actions">
                ${facilityMapUrl ? `<a href="${escapeHtml(facilityMapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name || "시설")} 지도 보기, 새 창">지도 보기</a>` : ""}
                ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name || "시설")} 공식 출처 확인, 새 창">공식 출처</a>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
      ${payload.safety_note ? `<p class="games-resource-warning">${escapeHtml(payload.safety_note)}</p>` : ""}
    `;
  }

  function renderFacilityError() {
    const target = document.getElementById("gamesFacilityResults");
    if (target) {
      target.innerHTML = '<p class="games-facility-status">시설 정보를 불러오지 못했습니다.<button type="button" data-retry-facilities>다시 시도</button></p>';
    }
  }

  async function loadFacilities(venue) {
    facilityRequest?.abort();
    facilityRequest = new AbortController();
    try {
      const response = await fetch(FACILITY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: facilityRequest.signal,
        body: JSON.stringify({
          question: `${venue.name} 주변 장애인 화장실과 전동휠체어 급속충전기를 찾아줘`,
          history: [],
          proximity_request: {
            resource_types: RESOURCE_TYPES,
            latitude: venue.latitude,
            longitude: venue.longitude,
            accuracy_meters: 0,
            limit: 4
          }
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (selectedVenueId === venue.id) {
        renderFacilityResults(payload);
      }
    } catch (error) {
      if (error.name !== "AbortError" && selectedVenueId === venue.id) {
        renderFacilityError();
      }
    }
  }

  function selectVenue(id, { updateHistory = true, focus = false } = {}) {
    const venue = pageData.venues.find((item) => item.id === id) || pageData.venues[0];
    selectedVenueId = venue.id;
    renderVenueList(venueSearch.value);
    renderVenueDetail(venue);
    loadFacilities(venue);

    if (updateHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("venue", venue.id);
      window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (focus) {
      venueDetail.focus({ preventScroll: true });
      venueDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderLoadError() {
    venueList.innerHTML = '<p class="games-empty">경기장 정보를 불러오지 못했습니다.</p>';
    venueDetail.innerHTML = '<div class="games-detail-loading"><strong>대회 안내를 불러오지 못했습니다.</strong><button class="primary-button" type="button" data-retry-page>다시 시도</button></div>';
    overviewContent.innerHTML = '<p class="games-empty">대회 개요를 불러오지 못했습니다.</p>';
    scheduleResults.innerHTML = '<p class="games-empty">전체 경기 일정을 불러오지 못했습니다.</p>';
    contactGrid.innerHTML = '<p class="games-empty">연락처를 불러오지 못했습니다.</p>';
    incidentList.innerHTML = '<p class="games-empty">운영 이슈를 불러오지 못했습니다.</p>';
    officialSourceGrid.innerHTML = '<p class="games-empty">공식 정보를 불러오지 못했습니다.</p>';
    operationsSummary.dataset.kind = "critical";
    operationsSummary.innerHTML = '<i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i><div><strong>운영 상태를 불러오지 못했습니다.</strong><span>대회 공식 홈페이지를 직접 확인해 주세요.</span></div>';
  }

  async function loadData() {
    for (const url of DATA_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          return response.json();
        }
      } catch (error) {
        // The bundled file remains available when the live API is offline.
      }
    }
    throw new Error("대회 데이터를 불러오지 못했습니다.");
  }

  async function loadPage() {
    try {
      pageData = validateData(await loadData());
      updatedAt.textContent = `정보 기준 ${formatReferenceDate(pageData.updated_at)}`;
      renderEventStatus();
      renderOverview();
      renderSchedule();
      renderContacts();
      renderOperations();
      renderNotices();
      const requestedVenue = new URLSearchParams(window.location.search).get("venue");
      selectVenue(requestedVenue, { updateHistory: false });
      const url = new URL(window.location.href);
      url.searchParams.set("venue", selectedVenueId);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      renderLoadError();
    }
  }

  venueSearch.addEventListener("input", () => {
    if (pageData) {
      renderVenueList(venueSearch.value);
    }
  });

  // 검색어·지역·장애유형이 바뀌면 목록 내용이 달라지므로 항상 1페이지로 되돌린다.
  scheduleSearch.addEventListener("input", () => {
    if (pageData) {
      resetDayPanelPage();
      renderSchedule();
    }
  });

  scheduleScope.addEventListener("change", () => {
    if (pageData) {
      resetDayPanelPage();
      renderSchedule();
    }
  });

  scheduleDisability?.addEventListener("change", () => {
    if (pageData) {
      resetDayPanelPage();
      renderSchedule();
    }
  });

  mySportSearch?.addEventListener("input", () => {
    applyMySportQuery(mySportSearch.value);
  });

  mySportForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    applyMySportQuery(mySportSearch.value, { scroll: true, remember: true });
  });

  recentSportList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recent-sport]");
    if (!button) {
      return;
    }
    mySportSearch.value = button.dataset.recentSport;
    applyMySportQuery(button.dataset.recentSport, { scroll: true, remember: true });
  });

  bottomFindButton?.addEventListener("click", () => {
    focusScheduleSearch();
  });

  scheduleResults.addEventListener("click", (event) => {
    if (!pageData) {
      return;
    }

    // 그날 목록 페이지 이동(‹ 이전 / 다음 ›) — 달력은 그대로 두고 목록만 갱신
    const dayPageButton = event.target.closest("[data-day-page-step]");
    if (dayPageButton) {
      dayPanelPage += Number(dayPageButton.dataset.dayPageStep);
      renderDayPanelOnly();
      // 교체된 노드에서 같은 방향 버튼에 포커스를 되돌려 연속 조작이 끊기지 않게 한다.
      const sameButton = scheduleResults.querySelector(`[data-day-page-step="${dayPageButton.dataset.dayPageStep}"]`);
      (sameButton && !sameButton.disabled ? sameButton : scheduleResults.querySelector("[data-day-page-step]"))?.focus();
      return;
    }

    // 달력 날짜 선택 → 그날 전체 경기 목록
    const dateCell = event.target.closest("[data-schedule-date]");
    if (dateCell) {
      selectedScheduleDate = dateCell.dataset.scheduleDate;
      resetDayPanelPage();
      renderSchedule({ focusSelectedDate: true });
      announceSelectedDate(buildDateIndex(filterScheduleEntries()).get(selectedScheduleDate)?.length || 0);
      return;
    }

    // 월 이동(‹ ›)과 8월 사전경기 핀
    const monthStepButton = event.target.closest("[data-month-step]");
    const gotoMonthButton = event.target.closest("[data-goto-month]");
    if (monthStepButton || gotoMonthButton) {
      calendarMonth = monthStepButton
        ? shiftMonth(calendarMonth, Number(monthStepButton.dataset.monthStep))
        : gotoMonthButton.dataset.gotoMonth;
      selectedScheduleDate = "";
      resetDayPanelPage();
      renderSchedule();
      scheduleResults.querySelector(".games-calendar-title")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // 좌측 종목 선택 → 달력에 그 종목 경기일 강조(양방향 연동)
    const sportButton = event.target.closest("[data-sport-index]");
    if (sportButton) {
      const nextIndex = Number(sportButton.dataset.sportIndex);
      selectedScheduleSportIndex = nextIndex === selectedScheduleSportIndex ? -1 : nextIndex;
      resetDayPanelPage();
      if (selectedScheduleSportIndex >= 0) {
        rememberSport(pageData.sports[selectedScheduleSportIndex]?.name);
        jumpCalendarToSport(selectedScheduleSportIndex);
      }
      renderSchedule();
      scheduleResults.querySelector(`[data-sport-index="${selectedScheduleSportIndex}"]`)?.focus();
    }
  });

  scheduleResults.addEventListener("change", (event) => {
    if (event.target.id !== "gamesSportSelect" || !pageData) {
      return;
    }
    selectedScheduleSportIndex = Number(event.target.value);
    resetDayPanelPage();
    if (selectedScheduleSportIndex >= 0) {
      rememberSport(pageData.sports[selectedScheduleSportIndex]?.name);
      jumpCalendarToSport(selectedScheduleSportIndex);
    }
    renderSchedule();
    document.getElementById("gamesSportSelect")?.focus();
  });

  venueList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-venue-id]");
    if (button && pageData) {
      selectVenue(button.dataset.venueId, { focus: true });
    }
  });

  venueDetail.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-facilities]") && pageData) {
      selectVenue(selectedVenueId, { updateHistory: false });
    }
    if (event.target.closest("[data-retry-page]")) {
      loadPage();
    }
  });

  window.addEventListener("popstate", () => {
    if (pageData) {
      selectVenue(new URLSearchParams(window.location.search).get("venue"), { updateHistory: false });
    }
  });

  renderRecentSports();
  loadPage();
})();
