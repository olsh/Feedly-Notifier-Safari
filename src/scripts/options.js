"use strict";

var optionsPageGlobal = {
    options: {}
};

safari.self.tab.dispatchMessage("optionsLoaded");
safari.self.addEventListener("message", handleMessage, false);

function handleMessage (event){
    switch (event.name){
        case "options":
            loadOptions(event.message);
            break;
        case "userCategories":
            loadUserCategories(event.message);
            break;
        case "userProfile":
            loadProfileData(event.message);
            break;
    }
}

$("body").on("click", "#save", function (e) {
    var form = document.getElementById("options");
    if (form.checkValidity()) {
        e.preventDefault();
        saveOptions();
    }
});

$("body").on("click", "#logout", function () {
    safari.self.tab.dispatchMessage("logout");
    $("#userInfo, #filters-settings").hide();
});

$("#options").on("change", "input", function (e) {
    $("[data-disable-parent]").each(function(key, value){
        var child = $(value);
        var parent = $("input[data-option-name='" + child.data("disable-parent") + "']");
        parent.is(":checked") ? child.attr("disabled", "disable") : child.removeAttr("disabled");
    });

    $("[data-enable-parent]").each(function(key, value){
        var child = $(value);
        var parent = $("input[data-option-name='" + child.data("enable-parent") + "']");
        !parent.is(":checked") ? child.attr("disabled", "disable") : child.removeAttr("disabled");
    });
});

function loadProfileData(profileData) {
    if (profileData) {
        var userInfo = $("#userInfo");
        for (var data in profileData) {
            userInfo.find("span[data-value-name='" + data + "']").text(profileData[data]);
        }
        userInfo.show();
    } else {
        $("#userInfo, #filters-settings").hide();
    }
}

function loadUserCategories(categories){
    categories.forEach(function (category) {
        appendCategory(category);
    });
}

function appendCategory(category){
    var categories = $("#categories");
    var label = $("<label for='" + category.id + "' class='label' />").text(category.label);
    var checkbox = $("<input id='" + category.id + "' type='checkbox' />").attr("data-id", category.id).prop("checked", category.checked);
    categories.append(label);
    categories.append(checkbox);
    categories.append("<br/>");
}

function parseFilters() {
    var filters = [];
    $("#categories").find("input[type='checkbox']:checked").each(function (key, value) {
        var checkbox = $(value);
        filters.push(checkbox.data("id"));
    });
    return filters;
}

/* Save all option in the web storage */
function saveOptions() {
    var options = optionsPageGlobal.options || {};
    $("#options").find("input[data-option-name]").each(function (optionName, value) {
        var optionControl = $(value);
        var optionValue;
        if (optionControl.attr("type") === "checkbox") {
            optionValue = optionControl.is(":checked");
        } else if (optionControl.attr("type") === "number") {
            optionValue = Number(optionControl.val());
        } else {
            optionValue = optionControl.val();
        }
        optionsPageGlobal.options[optionControl.data("option-name")] = optionValue;
    });
    optionsPageGlobal.options.filters = parseFilters();

    safari.self.tab.dispatchMessage("optionsSaved", optionsPageGlobal.options);
    alert("Options have been saved!");
}

function loadOptions(currentOptions) {
    var optionsForm = $("#options");
    for (var option in currentOptions) {
        var optionControl = optionsForm.find("input[data-option-name='" + option + "']");
        if (optionControl.attr("type") === "checkbox") {
            optionControl.attr("checked", currentOptions[option]);
        } else {
            optionControl.val(currentOptions[option]);
        }
    }
    optionsPageGlobal.options = currentOptions;
    optionsForm.find("input").trigger("change");
}