const API_URL = "http://localhost:3000";
const authToken = localStorage.getItem("authToken");

if (!authToken) {
    window.location.href = "login.html";
}

const form = document.getElementById("changePasswordForm");
const messageBox = document.getElementById("formMessage");
const cancelBtn = document.getElementById("cancelChangeBtn");

// Cancel နှိပ်ရင် Logout လုပ်မယ်
cancelBtn.addEventListener("click", function(e) {
    e.preventDefault();
    localStorage.removeItem("authToken");
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
});

form.addEventListener("submit", async function(e) {
    e.preventDefault();

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (newPassword.length < 6) {
        messageBox.textContent = "New password must be at least 6 characters.";
        messageBox.className = "error";
        return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        messageBox.textContent = "Password must contain at least one letter and one number.";
        messageBox.className = "error";
        return;
    }

    if (newPassword !== confirmPassword) {
        messageBox.textContent = "New passwords do not match.";
        messageBox.className = "error";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/change-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + authToken
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            messageBox.textContent = data.message;
            messageBox.className = "error";
            return;
        }

        // အောင်မြင်ရင် Message ပြပြီး Login ကို ပြန်ပို့မယ်
        messageBox.textContent = "Password changed successfully! Please login again.";
        messageBox.className = "success";
        
        localStorage.removeItem("authToken");
        localStorage.removeItem("loggedInUser");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 2000);

    } catch (error) {
        console.error(error);
        messageBox.textContent = "Cannot connect to server.";
        messageBox.className = "error";
    }
});