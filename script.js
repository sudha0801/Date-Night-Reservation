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
   0. SHARED TEXT-FILE DATABASE (GitHub-backed)
   Reservations live in a plain text file (reservations.txt,
   one JSON object per line) inside the GitHub repo. Every
   add/edit/delete reads the latest copy, changes it, then
   writes the whole file back via the GitHub Contents API,
   so both of you always see the same list.
=========================================================*/
const GITHUB_CONFIG = {
  owner: "sudha0801",
  repo: "Date-Night-Reservation",
  branch: "main",
  path: "reservations.txt",
  // Fine-grained token, scoped to ONLY this repo, Contents: Read and write.
  // Anyone who views this file's source can see this token, so keep its
  // scope this narrow and regenerate it if the repo is ever forked/shared.
  token:
    "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",
};

let database = []; // In-memory mirror of reservations.txt
let dbFileSha = null; // Needed by GitHub's API to update the file safely

function encodeBase64Unicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64Unicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

// Reads reservations.txt fresh from GitHub and rebuilds `database` from it.
async function fetchDatabaseFile() {
  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });

    if (res.status === 404) {
      // File doesn't exist yet — first-ever reservation will create it.
      database = [];
      dbFileSha = null;
      return database;
    }

    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);

    const data = await res.json();
    dbFileSha = data.sha;

    const content = decodeBase64Unicode(data.content.replace(/\n/g, ""));

    database = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null; // skip any corrupted line rather than crash
        }
      })
      .filter(Boolean);

    return database;
  } catch (err) {
    console.error("Failed to load reservations.txt:", err);
    showToast(
      "error",
      "Couldn't Load Dates",
      "Failed to load the shared reservation log. Showing local data only.",
    );
    return database;
  }
}

// Writes the entire in-memory `database` array back to reservations.txt.
async function saveDatabaseFile(commitMessage) {
  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
  const content =
    database.map((item) => JSON.stringify(item)).join("\n") + "\n";

  const body = {
    message: commitMessage || "Update reservations log",
    content: encodeBase64Unicode(content),
    branch: GITHUB_CONFIG.branch,
  };
  if (dbFileSha) body.sha = dbFileSha;

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${GITHUB_CONFIG.token}`,
    "Content-Type": "application/json",
  };

  let res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    // Someone else's save landed first — refetch the latest sha and retry once.
    await fetchDatabaseFile();
    body.sha = dbFileSha;
    res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) throw new Error(`GitHub save failed: ${res.status}`);

  const data = await res.json();
  dbFileSha = data.content.sha;
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
      id: editingId,
    };

    document.getElementById("successHeadline").textContent =
      "Reservation Updated!";

    document.getElementById("successSubline").textContent =
      "Your updated reservation has been saved.";
  } else {
    // Normal Insert Routine
    booking.id = Date.now();
    database.push({ ...booking });
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

window.addEventListener("load", () => {
  resetBooking();

  document.getElementById("dynamicDropdownContainer").innerHTML = "";

  document
    .querySelectorAll(".calendar-day.selected, .time-slot.selected")
    .forEach((el) => el.classList.remove("selected"));
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
