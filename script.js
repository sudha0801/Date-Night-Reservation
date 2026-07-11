function showConfirmation(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");

    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMessage").textContent = message;

    modal.classList.remove("hidden");

    const yes = document.getElementById("confirmYes");
    const no = document.getElementById("confirmNo");

    function cleanup(result) {
      modal.classList.add("hidden");

      yes.removeEventListener("click", yesClick);
      no.removeEventListener("click", noClick);

      resolve(result);
    }

    function yesClick() {
      cleanup(true);
    }

    function noClick() {
      cleanup(false);
    }

    yes.addEventListener("click", yesClick);

    no.addEventListener("click", noClick);
  });
}

// Global Variables
let selectedActivity = [];
let currentDropdownLevel = 0;

// ===============================
// Dropdown Heading Configuration
// ===============================
const dropdownHeadings = {
  root: "What would you like to do?",

  "🎬 Movie": {
    nextLevel: "Select Format",
    "🎥 Single Movie": "Select Genre",
  },

  "📺 Binge Watch Series": {
    nextLevel: "Select Genre",
  },

  "🍳 Cook/Bake Together": {
    nextLevel: "Select Activity Type",
    Cook: "Select Cuisine",
    Bake: "Select Dessert Type",
  },

  "🎨 Painting/Colouring": {
    nextLevel: "Select Style",
  },

  "🎮 Game Night": {
    nextLevel: "Select Game Type",
  },

  "📚 Read a Book": {
    nextLevel: "Select Genre",
  },

  finalSuggestions: {
    "🎬 Movie": "Movie Suggestions",
    "📺 Binge Watch Series": "Series Suggestions",
    "🍳 Cook/Bake Together": "Recipes",
    "🎨 Painting/Colouring": "Style Options",
    "🎮 Game Night": "Game Suggestions",
    "📚 Read a Book": "Book Suggestions",
  },
};

// Strips emoji from a string (used only on activitySelections before they're
// written to the shared reservations file — the emoji still show everywhere
// else in the app, like the review page and confirmation email).
function stripEmojis(str) {
  if (!str) return str;
  return str
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function showToast(type, title, message) {
  const icons = {
    success: "💖",
    error: "💔",
    warning: "💛",
    info: "❤️",
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>

        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

  document.getElementById("toastContainer").appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

/*=========================================================
        OUR DATE NIGHT - APPLICATION SCRIPT
=========================================================*/

// Global Email Configurations
const APP_CONFIG = {
  USER_EMAIL: "datenightreservation0801@gmail.com",
  RECIPIENT_EMAIL: "sudharshanmoodley946@gmail.com",
  EMAILJS_SERVICE_ID: "service_m8n1hse",
  EMAILJS_CONFIRM_TEMPLATE: "template_b31fft9",
  EMAILJS_UPDATE_TEMPLATE: "template_3zrcvei",
};

// Application State Store
let booking = {
  id: null,
  date: "",
  time: "",
  activitySelections: [], // Dynamic levels saved here sequentially
  food: "",
  order: "",
  message: "",
};

let editingId = null; // Tracks if we are editing an existing record

/*=========================================================
   0. SHARED TEXT-FILE DATABASE (via Cloudflare Worker)
   Reservations live in a plain text file (reservations.txt,
   one JSON object per line) inside the GitHub repo. The
   browser never talks to GitHub directly — it calls a small
   Cloudflare Worker, which holds the GitHub token as a
   server-side secret and does the actual read/write. That
   keeps the token out of this public repo entirely.
=========================================================*/
const WORKER_CONFIG = {
  // Your Worker's URL + /reservations, e.g.
  // "https://date-night-reservations.yoursubdomain.workers.dev/reservations"
  url: "https://date-night-reservations.sudharshanmoodley946.workers.dev/reservations",
  // Must match the SITE_KEY secret you set in the Worker's dashboard.
  siteKey: "PASTE_YOUR_SITE_KEY_HERE",
};

let database = []; // In-memory mirror of reservations.txt

// Reads reservations.txt fresh (via the Worker) and rebuilds `database`.
async function fetchDatabaseFile() {
  try {
    const res = await fetch(WORKER_CONFIG.url, {
      headers: { "X-Site-Key": WORKER_CONFIG.siteKey },
      cache: "no-store",
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Worker read failed: ${res.status}`);
    }

    const data = await res.json();
    database = Array.isArray(data.reservations) ? data.reservations : [];
    return database;
  } catch (err) {
    console.error("Failed to load reservations:", err);
    showToast(
      "error",
      "Couldn't Load Dates",
      `Failed to load the shared reservation log: ${err.message}`,
    );
    return database;
  }
}

// Writes the entire in-memory `database` array back to reservations.txt
// (via the Worker, which handles the GitHub commit itself).
async function saveDatabaseFile(commitMessage) {
  const res = await fetch(WORKER_CONFIG.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Site-Key": WORKER_CONFIG.siteKey,
    },
    body: JSON.stringify({
      reservations: database,
      message: commitMessage || "Update reservations log",
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Worker save failed: ${res.status}`);
  }
}

// Page Reference Handlers
const pages = document.querySelectorAll(".page");
const landingPage = document.getElementById("landingPage");
const logPage = document.getElementById("logPage");
const datePage = document.getElementById("datePage");
const timePage = document.getElementById("timePage");
const activityPage = document.getElementById("activityPage");
const reviewPage = document.getElementById("reviewPage");
const loadingPage = document.getElementById("loadingPage");
const successPage = document.getElementById("successPage");

// Navigation Control Bindings
document.getElementById("startBooking").onclick = () => {
  editingId = null;
  showPage(datePage);
};
document.getElementById("viewLogBtn").onclick = async () => {
  showPage(logPage);
  const tbody = document.getElementById("logTableBody");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading scheduled dates...</td></tr>`;
  await fetchDatabaseFile();
  await pruneExpiredReservations();
  renderLogTable();
};
document.getElementById("backToLandingFromLog").onclick = () =>
  showPage(landingPage);
document.getElementById("backToLanding").onclick = () => showPage(landingPage);
document.getElementById("backToDate").onclick = () => showPage(datePage);
document.getElementById("backToTime").onclick = () => showPage(timePage);
document.getElementById("editBooking").onclick = () => showPage(activityPage);
document.getElementById("newBooking").onclick = () => {
  resetBooking();
  showPage(landingPage);
};

function showPage(page) {
  pages.forEach((p) => p.classList.remove("active"));
  page.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/*=========================================================
   1. CHRONOLOGICAL DATE PICKER LIMITER (PAST INACCESSIBLE)
=========================================================*/
const calendar = document.getElementById("calendar");
const monthYear = document.getElementById("monthYear");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/*=========================================================
   0b. EXPIRED RESERVATION CLEANUP
   Reservation dates are stored like "12 July 2026" and times
   like "18:00". This turns that pair into a real Date so it
   can be compared against right now, and removes anything
   whose date AND time have both already passed.
=========================================================*/
function parseReservationDateTime(item) {
  if (!item || !item.date || !item.time) return null;

  const dateParts = item.date.split(" ");
  if (dateParts.length !== 3) return null;

  const [day, monthName, year] = dateParts;
  const monthIndex = monthNames.indexOf(monthName);
  if (monthIndex === -1) return null;

  const timeParts = item.time.split(":").map(Number);
  if (timeParts.length !== 2 || timeParts.some(Number.isNaN)) return null;
  const [hours, minutes] = timeParts;

  const dt = new Date(Number(year), monthIndex, Number(day), hours, minutes);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// Removes reservations whose date & time are both in the past, and,
// if anything was actually removed, writes the trimmed list back to
// reservations.txt so the change is reflected for both of you.
async function pruneExpiredReservations() {
  const now = new Date();
  const beforeCount = database.length;

  database = database.filter((item) => {
    const dt = parseReservationDateTime(item);
    if (!dt) return true; // Can't confidently parse it — leave it alone
    return dt.getTime() >= now.getTime();
  });

  if (database.length !== beforeCount) {
    try {
      await saveDatabaseFile("Remove expired reservations");
    } catch (err) {
      console.error("Failed to remove expired reservations:", err);
      // Not shown as a toast — this runs quietly in the background,
      // and a failed cleanup isn't worth interrupting the user over.
    }
  }
}
let systemDate = new Date();
let currentMonth = systemDate.getMonth();
let currentYear = systemDate.getFullYear();

function generateCalendar() {
  calendar.innerHTML = "";
  monthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const shiftOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  for (let i = 0; i < shiftOffset; i++) {
    calendar.appendChild(document.createElement("div"));
  }

  // Create absolute comparison values for chronological bounds checking
  const todayComparison = new Date(
    systemDate.getFullYear(),
    systemDate.getMonth(),
    systemDate.getDate(),
  ).getTime();

  for (let day = 1; day <= totalDays; day++) {
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = day;

    const cellDateComparison = new Date(
      currentYear,
      currentMonth,
      day,
    ).getTime();

    if (cellDateComparison < todayComparison) {
      div.classList.add("disabled"); // Disables pointer events and lowers opacity
    } else {
      if (cellDateComparison === todayComparison) {
        div.classList.add("today");
      }
      div.onclick = () => {
        document
          .querySelectorAll(".calendar-day")
          .forEach((d) => d.classList.remove("selected"));
        div.classList.add("selected");
        booking.date = `${day} ${monthNames[currentMonth]} ${currentYear}`;
      };
    }
    calendar.appendChild(div);
  }
}

prevMonth.onclick = () => {
  if (
    currentYear === systemDate.getFullYear() &&
    currentMonth === systemDate.getMonth()
  )
    return; // Lock going backward into past months
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  generateCalendar();
};

nextMonth.onclick = () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  generateCalendar();
};

generateCalendar();

/*=========================================================
   2. TIME GRID GENERATOR
=========================================================*/
const timeGrid = document.getElementById("timeGrid");
function generateTimes() {
  timeGrid.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const slot = document.createElement("div");
      slot.className = "time-slot";
      const hr = String(h).padStart(2, "0");
      const min = String(m).padStart(2, "0");
      slot.textContent = `${hr}:${min}`;
      slot.onclick = () => {
        document
          .querySelectorAll(".time-slot")
          .forEach((s) => s.classList.remove("selected"));
        slot.classList.add("selected");
        booking.time = slot.textContent;
      };
      timeGrid.appendChild(slot);
    }
  }
}
generateTimes();

/*=========================================================
   3. RECURSIVE CASCADING DROPDOWNS IMPLEMENTATION
=========================================================*/
const dynamicContainer = document.getElementById("dynamicDropdownContainer");

function createOtherTextbox(depth, wrapper) {
  const input = document.createElement("input");

  input.type = "text";
  input.placeholder = "Please specify...";
  input.className = "other-input";

  input.addEventListener("input", () => {
    booking.activitySelections[depth] = input.value;
  });

  wrapper.appendChild(input);
}

function updateCascadingDropdowns(depth, currentObjectContext) {
  // Clear any structural nodes down-chain from target depth
  const activeColumns = dynamicContainer.querySelectorAll(".activity-column");
  activeColumns.forEach((col, index) => {
    if (index >= depth) col.remove();
  });

  if (!currentObjectContext || typeof currentObjectContext !== "object") return;

  const keys = Array.isArray(currentObjectContext)
    ? currentObjectContext
    : Object.keys(currentObjectContext);
  if (keys.length === 0) return;

  // Build structure nodes cleanly
  const wrapper = document.createElement("div");
  wrapper.className = "activity-column";

  const label = document.createElement("label");
  // Set the heading for each dropdown (4 levels maximum)
  let heading = dropdownHeadings.root;

  switch (depth) {
    case 0:
      heading = dropdownHeadings.root;
      break;

    case 1:
      heading =
        dropdownHeadings[booking.activitySelections[0]]?.nextLevel ||
        "Select Option";
      break;

    case 2:
      heading =
        dropdownHeadings[booking.activitySelections[0]]?.[
          booking.activitySelections[1]
        ] || "Select Option";
      break;

    case 3:
      heading =
        dropdownHeadings[booking.activitySelections[1]]?.[
          booking.activitySelections[2]
        ] ||
        dropdownHeadings[booking.activitySelections[0]]?.[
          booking.activitySelections[2]
        ] ||
        "Final Selection";
      break;
  }

  label.textContent = heading;

  const select = document.createElement("select");
  select.innerHTML = '<option value="">Choose...</option>';

  keys.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  dynamicContainer.appendChild(wrapper);

  select.addEventListener("change", (e) => {
    const selectedVal = e.target.value;

    booking.activitySelections[depth] = selectedVal;
    booking.activitySelections = booking.activitySelections.slice(0, depth + 1);

    // Remove everything after this dropdown
    while (wrapper.lastChild !== select) {
      wrapper.removeChild(wrapper.lastChild);
    }

    if (!selectedVal) {
      updateCascadingDropdowns(depth + 1, null);
      return;
    }

    if (selectedVal === "Other") {
      createOtherTextbox(depth, wrapper);
      updateCascadingDropdowns(depth + 1, null);
      return;
    }

    const nestedContext = currentObjectContext[selectedVal];

    // If this option has no children, stop.
    if (
      !nestedContext ||
      typeof nestedContext !== "object" ||
      Object.keys(nestedContext).length === 0
    ) {
      updateCascadingDropdowns(depth + 1, null);
      return;
    }

    updateCascadingDropdowns(depth + 1, nestedContext);
  });
}

// Global Text Input listeners for order details
document
  .getElementById("order")
  .addEventListener("input", (e) => (booking.order = e.target.value));
document
  .getElementById("loveMessage")
  .addEventListener("input", (e) => (booking.message = e.target.value));

// Food Choice Management Logic
const wantFood = document.getElementById("wantFood");
const foodOptions = document.getElementById("foodOptions");
const customFood = document.getElementById("customFood");
const foodChoices = document.querySelectorAll(".foodChoice");

foodChoices.forEach((choice) => {
  choice.addEventListener("change", function () {
    if (this.checked) {
      foodChoices.forEach((box) => {
        if (box !== this) {
          box.checked = false;
        }
      });
    }
  });
});

function updateFoodSelection() {
  let choices = [];
  foodChoices.forEach((cb) => {
    if (cb.checked) choices.push(cb.value);
  });
  if (document.getElementById("foodOther").checked) {
    customFood.classList.remove("hidden");
    if (customFood.value.trim()) choices.push(customFood.value.trim());
  } else {
    customFood.classList.add("hidden");
  }
  booking.food = choices.join(", ");
}

wantFood.addEventListener("change", () => {
  if (wantFood.checked) {
    foodOptions.classList.remove("hidden");
  } else {
    foodOptions.classList.add("hidden");
    foodChoices.forEach((cb) => (cb.checked = false));
    customFood.value = "";
    booking.food = "";
  }
});
foodChoices.forEach((cb) => cb.addEventListener("change", updateFoodSelection));
customFood.addEventListener("input", updateFoodSelection);

/*=========================================================
   4. NAVIGATION STEP INTEGRATIONS & FORM VALIDATIONS
=========================================================*/
document.getElementById("toTime").onclick = () => {
  if (!booking.date)
    return showToast(
      "warning",
      "Choose a Date",
      "Pick a special day for us before continuing. ❤️",
    );
  showPage(timePage);
};

document.getElementById("toActivity").onclick = () => {
  if (!booking.time)
    return showToast(
      "warning",
      "Choose a Time",
      "Every perfect date needs a perfect time. 🕒",
    );
  // Hydrate activity structure initially on navigation context mapping
  updateCascadingDropdowns(0, activities);
  showPage(activityPage);
};

document.getElementById("toReview").onclick = () => {
  if (
    booking.activitySelections.length === 0 ||
    booking.activitySelections.some((val) => !val)
  ) {
    return showToast(
      "warning",
      "Activity Needed",
      "Let's decide what we'll be doing together first. 🎉",
    );
  }

  if (wantFood.checked && !booking.food) {
    return showToast(
      "warning",
      "Food Selection Missing",
      "Please select a food option or specify your own. 🍽️",
    );
  }

  if (wantFood.checked && !document.getElementById("order").value.trim()) {
    return showToast(
      "warning",
      "Food Order Missing",
      "Tell me what you'd like to eat so I can make sure everything is perfect. 🍗",
    );
  }

  document.getElementById("summaryDateTime").textContent =
    `${booking.date} @ ${booking.time}`;
  document.getElementById("summaryActivityDetails").textContent =
    booking.activitySelections.join(" ➔ ");
  document.getElementById("summaryFood").textContent =
    booking.food || "No food requested";
  document.getElementById("summaryOrder").textContent = wantFood.checked
    ? booking.order || "No order entered"
    : "N/A";
  showPage(reviewPage);
};

/*=========================================================
   5. RESERVATION PERSISTENCE (CONFIRM / INSERT / EDIT)
=========================================================*/
document.getElementById("confirmBooking").onclick = async () => {
  // Pull the latest shared copy first so we don't overwrite a change
  // the other person just made from their own device.
  await fetchDatabaseFile();

  const templateParams = {
    to_email: APP_CONFIG.RECIPIENT_EMAIL,
    from_email: APP_CONFIG.USER_EMAIL,

    booking_date: booking.date,
    booking_time: booking.time,

    activity: booking.activitySelections.join(" → "),

    food: booking.food || "None",

    order: booking.order || "N/A",

    message: booking.message || "No message provided.",
  };

  if (editingId !== null) {
    const editReason = await showReasonPrompt(
      "Update Reservation",
      "Please tell me why you're updating this reservation:",
    );

    if (editReason === null) {
      showPage(reviewPage);
      return;
    }

    if (!editReason) {
      showToast(
        "warning",
        "Reason Required",
        "Please enter a reason for updating the reservation.",
      );
      showPage(reviewPage);
      return;
    }
    const originalRecord = database.find((item) => item.id === editingId);

    templateParams.old_booking_date = originalRecord.date;
    templateParams.old_booking_time = originalRecord.time;

    templateParams.old_activity = originalRecord.activitySelections.join(" → ");

    templateParams.old_food = originalRecord.food || "None";

    templateParams.old_order = originalRecord.order || "N/A";

    templateParams.header_icon = "✏️";

    templateParams.action = "Updated";

    templateParams.status_message =
      "Your reservation has been successfully updated.";

    templateParams.reason = editReason;

    templateParams.message = booking.message || "No additional notes.";

    const index = database.findIndex((item) => item.id === editingId);

    database[index] = {
      ...booking,
      activitySelections: booking.activitySelections.map(stripEmojis),
      id: editingId,
    };

    document.getElementById("successHeadline").textContent =
      "Reservation Updated!";

    document.getElementById("successSubline").textContent =
      "Your updated reservation has been saved.";
  } else {
    // Normal Insert Routine
    booking.id = Date.now();
    database.push({
      ...booking,
      activitySelections: booking.activitySelections.map(stripEmojis),
    });
    document.getElementById("successHeadline").textContent =
      "Reservation Confirmed!";
    document.getElementById("successSubline").textContent =
      "A confirmation notification has been filed.";
  }
  showPage(loadingPage);

  try {
    await saveDatabaseFile(
      editingId !== null
        ? `Update reservation ${editingId}`
        : `Add reservation ${booking.id}`,
    );
  } catch (err) {
    console.error(err);
    showToast(
      "error",
      "Save Failed",
      "Couldn't write to the shared reservations file. Please try again.",
    );
    showPage(reviewPage);
    return;
  }

  const templateID =
    editingId !== null
      ? APP_CONFIG.EMAILJS_UPDATE_TEMPLATE
      : APP_CONFIG.EMAILJS_CONFIRM_TEMPLATE;

  emailjs
    .send(APP_CONFIG.EMAILJS_SERVICE_ID, templateID, templateParams)
    .then(() => {
      if (editingId !== null) {
        showToast(
          "success",
          "Reservation Updated 💖",
          "Your date night has been updated successfully. A confirmation email has been sent.",
        );

        renderLogTable();
        showPage(logPage);
      } else {
        setTimeout(() => {
          document.getElementById("ticketDate").textContent = booking.date;
          document.getElementById("ticketTime").textContent = booking.time;
          document.getElementById("ticketActivity").textContent =
            booking.activitySelections[booking.activitySelections.length - 1];

          showPage(successPage);
        }, 1500);
      }
    })
    .catch((err) => {
      console.error(err);

      showToast(
        "error",
        "Email Not Sent",
        "Your reservation was saved, but I couldn't send the confirmation email.",
      );

      renderLogTable();
      showPage(logPage);
    });
};

/*=========================================================
   6. LOG/DATABASE INTERFACES & DELETION DISPATCH
=========================================================*/
function renderLogTable() {
  const tbody = document.getElementById("logTableBody");
  tbody.innerHTML = "";

  if (database.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No upcoming dates scheduled yet. Go back and book one! ❤️</td></tr>`;
    return;
  }

  database.forEach((item) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${item.date}</strong><br><small>${item.time}</small></td>
      <td><span class="badge">${item.activitySelections.join(" ➔ ")}</span></td>
      <td><strong>Food:</strong> ${item.food || "None"}<br><small>Order: ${item.order || "None"}</small></td>
      <td>
        <div style="display:flex; gap:10px;">
          <button class="primary-btn btn-sm" onclick="editLogRecord(${item.id})">Edit</button>
          <button class="secondary-btn btn-sm" style="background:rgba(255,79,139,0.2);" onclick="deleteLogRecord(${item.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteLogRecord = async function (id) {
  await fetchDatabaseFile();

  const targetRecord = database.find((item) => item.id === id);
  if (!targetRecord) return;

  const validationConfirmation = await showConfirmation(
    "Cancel Our Date Night? 💔",
    `Our special evening is scheduled for ${targetRecord.date} at ${targetRecord.time}.\n\nAre you sure you want to let this moment go?`,
  );
  if (!validationConfirmation) return;
  const deleteReason = await showReasonPrompt(
    "Cancel Reservation",
    "Please tell me why you're cancelling this reservation:",
  );

  if (deleteReason === null) return;

  if (!deleteReason) {
    showToast(
      "warning",
      "Reason Required",
      "Please enter a reason for cancelling the reservation.",
    );
    return;
  }

  showPage(loadingPage);

  database = database.filter((item) => item.id !== id);

  try {
    await saveDatabaseFile(`Delete reservation ${id}`);
  } catch (err) {
    console.error(err);
    showToast(
      "error",
      "Delete Failed",
      "Couldn't write to the shared reservations file. Please try again.",
    );
    renderLogTable();
    showPage(logPage);
    return;
  }

  const templateParams = {
    header_icon: "❌",

    action: "Cancelled",

    status_message: "Your reservation has been cancelled.",

    old_booking_date: targetRecord.date,

    old_booking_time: targetRecord.time,

    old_activity: targetRecord.activitySelections.join(" → "),

    old_food: targetRecord.food || "None",

    old_order: targetRecord.order || "N/A",

    booking_date: "-",

    booking_time: "-",

    activity: "-",

    food: "-",

    order: "-",

    reason: deleteReason,

    message: "Hopefully we can arrange another date soon ❤️",
  };

  emailjs
    .send(
      APP_CONFIG.EMAILJS_SERVICE_ID,
      APP_CONFIG.EMAILJS_UPDATE_TEMPLATE,
      templateParams,
    )
    .then(() => {
      showToast(
        "success",
        "Date Cancelled 💔",
        "Your reservation has been cancelled successfully. A confirmation email has been sent.",
      );
      editingId = null;
      resetBooking();
      renderLogTable();
      showPage(logPage);
    })
    .catch((err) => {
      console.error(err);
      alert("Record stripped locally. Notification dispatch error.");
      renderLogTable();
      showPage(logPage);
    });
};

window.editLogRecord = function (id) {
  const targetRecord = database.find((item) => item.id === id);
  if (!targetRecord) return;

  editingId = id;

  // Hydrate configurations state values from storage model context parameters
  booking.date = targetRecord.date;
  booking.time = targetRecord.time;
  booking.activitySelections = [...targetRecord.activitySelections];
  booking.food = targetRecord.food;
  booking.order = targetRecord.order;
  booking.message = targetRecord.message;

  // Update input text contents visually
  document.getElementById("order").value = booking.order;
  document.getElementById("loveMessage").value = booking.message;
  wantFood.checked = !!booking.food;

  if (wantFood.checked) {
    foodOptions.classList.remove("hidden");
    foodChoices.forEach((cb) => {
      cb.checked = booking.food.includes(cb.value);
    });
  } else {
    foodOptions.classList.add("hidden");
  }

  // Route back directly into step-by-step editing pipeline flow
  showPage(datePage);
};

function resetBooking() {
  booking = {
    id: null,
    date: "",
    time: "",
    activitySelections: [],
    food: "",
    order: "",
    message: "",
  };
  editingId = null;
  document.getElementById("order").value = "";
  document.getElementById("loveMessage").value = "";
  wantFood.checked = false;
  foodOptions.classList.add("hidden");
  customFood.value = "";
  foodChoices.forEach((cb) => (cb.checked = false));
  generateCalendar();
  generateTimes();
}

/*=========================================================
   7. FLOATING ROMANTIC SPARK EFFECTS
=========================================================*/
function createHeart() {
  const heart = document.createElement("div");
  heart.className = "floating-heart";
  heart.innerHTML = "❤";
  heart.style.left = Math.random() * 100 + "vw";
  heart.style.animationDuration = Math.random() * 4 + 5 + "s";
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 9000);
}
setInterval(createHeart, 1800);

window.addEventListener("load", async () => {
  resetBooking();

  document.getElementById("dynamicDropdownContainer").innerHTML = "";

  document
    .querySelectorAll(".calendar-day.selected, .time-slot.selected")
    .forEach((el) => el.classList.remove("selected"));

  // Clear out any reservations whose date & time have already passed.
  await fetchDatabaseFile();
  await pruneExpiredReservations();
});

function showReasonPrompt(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("reasonModal");

    const titleElement = document.getElementById("reasonTitle");

    const messageElement = document.getElementById("reasonMessage");

    const input = document.getElementById("reasonInput");

    const confirm = document.getElementById("reasonConfirm");

    const cancel = document.getElementById("reasonCancel");

    titleElement.textContent = title;
    const icon = modal.querySelector(".confirm-icon");

    if (title.includes("Cancel")) {
      icon.textContent = "💔";
    } else {
      icon.textContent = "✏️";
    }

    messageElement.textContent = message;

    input.value = "";

    modal.classList.remove("hidden");

    input.focus();
    function keyHandler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        confirmClick();
      }
    }

    function cleanup(result) {
      modal.classList.add("hidden");
      input.value = "";

      confirm.removeEventListener("click", confirmClick);

      cancel.removeEventListener("click", cancelClick);
      input.removeEventListener("keydown", keyHandler);

      resolve(result);
    }

    function confirmClick() {
      const reason = input.value.trim();

      if (!reason) {
        showToast(
          "warning",
          "Reason Required",
          "Please enter a reason before continuing.",
        );

        input.focus();

        return;
      }

      cleanup(reason);
    }

    function cancelClick() {
      cleanup(null);
    }

    confirm.addEventListener("click", confirmClick);

    cancel.addEventListener("click", cancelClick);
    input.addEventListener("keydown", keyHandler);
  });
}
