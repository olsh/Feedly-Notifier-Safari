"use strict";

var optionsGlobal = {
    backgroundPage: safari.extension.globalPage.contentWindow
};

$(document).ready(function () {
    loadOptions();
    loadUserCategories();
    loadProfileData();
});

$("body").on("click", "#save", function (e) {
    var form = document.getElementById("options");
    if (form.checkValidity()) {
        e.preventDefault();
        saveOptions();
    }
});

$("body").on("click", "#logout", function () {
    optionsGlobal.backgroundPage.appGlobal.options.accessToken = "";
    optionsGlobal.backgroundPage.appGlobal.options.refreshToken = "";
    optionsGlobal.backgroundPage.writeOptions(optionsGlobal.backgroundPage.initialize);
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

function loadProfileData() {
    optionsGlobal.backgroundPage.apiRequestWrapper("profile", {
        useSecureConnection: optionsGlobal.backgroundPage.appGlobal.options.useSecureConnection,
        onSuccess: function (result) {
            var userInfo = $("#userInfo");
            userInfo.find("[data-locale-value]").each(function () {
                var textBox = $(this);
                var localValue = textBox.data("locale-value");
                textBox.text(chrome.i18n.getMessage(localValue));
            });
            userInfo.show();
            for (var profileData in result) {
                userInfo.find("span[data-value-name='" + profileData + "']").text(result[profileData]);
            }
        },
        onAuthorizationRequired: function () {
            $("#userInfo, #filters-settings").hide();
        }
    });
}

function loadUserCategories(){
    optionsGlobal.backgroundPage.apiRequestWrapper("categories", {
        onSuccess: function (result) {
            result.forEach(function(element){
                appendCategory(element.id, element.label);
            });
            appendCategory(chrome.extension.getBackgroundPage().appGlobal.globalUncategorized, "Uncategorized");
            chrome.storage.sync.get("filters", function(items){
                var filters = items.filters || [];
                filters.forEach(function(id){
                    $("#categories").find("input[data-id='" + id +"']").attr("checked", "checked");
                });
            });
        }
    });
}

function appendCategory(id, label){
    var categories = $("#categories");
    var label = $("<span class='label' />").text(label);
    var checkbox = $("<input type='checkbox' />").attr("data-id", id);
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
    var options = {};
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
        options[optionControl.data("option-name")] = optionValue;
    });
    options.filters = parseFilters();

    optionsGlobal.backgroundPage.writeOptions(optionsGlobal.backgroundPage.initialize);
    alert("Options have been saved!");
}

function loadOptions() {
    var optionsForm = $("#options");
    var currentOptions = optionsGlobal.backgroundPage.appGlobal.options;
    for (var option in currentOptions) {
        var optionControl = optionsForm.find("input[data-option-name='" + option + "']");
        if (optionControl.attr("type") === "checkbox") {
            optionControl.attr("checked", currentOptions[option]);
        } else {
            optionControl.val(currentOptions[option]);
        }
    }
    optionsForm.find("input").trigger("change");
    $("#header").text(chrome.i18n.getMessage("FeedlyNotifierOptions"));
    $("#options").find("[data-locale-value]").each(function () {
        var textBox = $(this);
        var localValue = textBox.data("locale-value");
        textBox.text(chrome.i18n.getMessage(localValue));
    });
}