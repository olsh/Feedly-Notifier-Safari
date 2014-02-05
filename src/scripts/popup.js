"use strict";

var popupGlobal = {
    feeds: [],
    savedFeeds: [],
    backgroundPage: safari.extension.globalPage.contentWindow
};

$(document).ready(function () {
    $("#feed, #feed-saved").css("font-size", popupGlobal.backgroundPage.appGlobal.options.popupFontSize / 100 + "em");

    if (popupGlobal.backgroundPage.appGlobal.options.abilitySaveFeeds) {
        $("#popup-content").addClass("tabs");
    }

    renderFeeds();
});

safari.application.addEventListener("popover", renderFeeds, true);

$("#login").click(function () {
    popupGlobal.backgroundPage.getAccessToken();
});

//using "mousedown" instead of "click" event to process middle button click.
$("#feed, #feed-saved").on("mousedown", "a", function (event) {
    var link = $(this);
    if (event.which === 1 || event.which === 2) {
        var isActive = !(event.ctrlKey || event.which === 2);
        popupGlobal.backgroundPage.openUrlInNewTab(link.data("link"), isActive);
        if (popupGlobal.backgroundPage.appGlobal.options.markReadOnClick && link.hasClass("title") && $("#feed").is(":visible")) {
            markAsRead([link.closest(".item").data("id")]);
        }
    }
});

$("#popup-content").on("click", "#mark-all-read", function (event) {
    var feedIds = [];
    $(".item:visible").each(function (key, value) {
        feedIds.push($(value).data("id"));
    });
    markAsRead(feedIds);
});

$("#feed").on("click", ".mark-read", function (event) {
    var feed = $(this).closest(".item");
    markAsRead([feed.data("id")]);
});

$("#feedly").on("click", "#btn-feeds-saved", function () {
    $(this).addClass("active-tab");
    $("#btn-feeds").removeClass("active-tab");
    renderSavedFeeds();
});

$("#feedly").on("click", "#btn-feeds", function () {
    $(this).addClass("active-tab");
    $("#btn-feeds-saved").removeClass("active-tab");
    renderFeeds();
});

$("#popup-content").on("click", ".show-content", function () {
    var $this = $(this);
    var feed = $this.closest(".item");
    var contentContainer = feed.find(".content");
    var feedId = feed.data("id");
    if (contentContainer.html() === "") {
        var content;
        var feeds = $("#feed").is(":visible") ? popupGlobal.feeds : popupGlobal.savedFeeds;

        for (var i = 0; i < feeds.length; i++) {
            if (feeds[i].id === feedId) {
                content = feeds[i].content
            }
        }
        if (content) {
            contentContainer.html(content);
            //For open new tab without closing popup
            contentContainer.find("a").each(function (key, value) {
                var link = $(value);
                link.data("link", link.attr("href"));
                link.attr("href", "javascript:void(0)");
            });
        }
    }
    contentContainer.slideToggle(function () {
        $this.css("background-position", contentContainer.is(":visible") ? "-288px -120px" : "-313px -119px");
        if (contentContainer.is(":visible") && contentContainer.text().length > 350) {
            setPopupExpand(true);
        } else {
            setPopupExpand(false);
        }
    });
});

/* Manually feeds update */
$("#feedly").on("click", "#update-feeds", function () {
    if ($("#feed").is(":visible")) {
        renderFeeds(true);
    } else {
        renderSavedFeeds(true);
    }
});

/* Save or unsave feed */
$("#popup-content").on("click", ".save-feed", function () {
    var $this = $(this);
    var feed = $this.closest(".item");
    var feedId = feed.data("id");
    var saveItem = !$this.data("saved");
    popupGlobal.backgroundPage.toggleSavedFeed(feedId, saveItem);
    $this.data("saved", saveItem);
    $this.toggleClass("saved");
});

$("#popup-content").on("click", "#website", function(){
    popupGlobal.backgroundPage.openFeedlyTab();
});

$("#popup-content").on("click", ".categories > span", function (){
    $(".categories").find("span").removeClass("active");
    var button = $(this).addClass("active");
    var categoryId = button.data("id");
    if (categoryId) {
        $(".item").hide();
        $(".item[data-categories~='" + categoryId + "']").show();
    } else {
        $(".item").show();
    }
});

function renderFeeds(forceUpdate) {
    showLoader();
    popupGlobal.backgroundPage.getFeeds(popupGlobal.backgroundPage.appGlobal.options.forceUpdateFeeds || forceUpdate, function (feeds, isLoggedIn) {
        popupGlobal.feeds = feeds;
        if (isLoggedIn === false) {
            showLogin();
        } else {
            if (feeds.length === 0) {
                showEmptyContent();
            } else {
                var container = $("#feed").show().empty();

                if (popupGlobal.backgroundPage.appGlobal.options.showCategories) {
                    renderCategories(container, feeds);
                }

                container.append($("#feedTemplate").mustache({feeds: feeds}));
                container.find(".timeago").timeago();
                showFeeds();
            }
        }
    });
}

function renderSavedFeeds(forceUpdate) {
    showLoader();
    popupGlobal.backgroundPage.getSavedFeeds(popupGlobal.backgroundPage.appGlobal.options.forceUpdateFeeds || forceUpdate, function (feeds, isLoggedIn) {
        popupGlobal.savedFeeds = feeds;
        if (isLoggedIn === false) {
            showLogin();
        } else {
            if (feeds.length === 0) {
                showEmptyContent();
            } else {
                var container = $("#feed-saved").empty();

                if (popupGlobal.backgroundPage.appGlobal.options.showCategories) {
                    renderCategories(container, feeds);
                }

                container.append($("#feedTemplate").mustache({feeds: feeds}));
                container.find(".timeago").timeago();
                showSavedFeeds();
            }
        }
    });
}

function markAsRead(feedIds) {
    var feedItems = $();
    for (var i = 0; i < feedIds.length; i++) {
        feedItems = feedItems.add(".item[data-id='" + feedIds[i] + "']");
    }

    feedItems.fadeOut("fast", function(){
        $(this).remove();
        resizeWindows();
    });

    feedItems.attr("data-is-read", "true");

    //Show loader if all feeds were read
    if ($("#feed").find(".item[data-is-read!='true']").size() === 0) {
        showLoader();
    }
    popupGlobal.backgroundPage.markAsRead(feedIds, function (isLoggedIn) {
        if ($("#feed").find(".item[data-is-read!='true']").size() === 0) {
            renderFeeds();
        }
    });
}

function renderCategories(container, feeds){
    $(".categories").remove();
    var categories = getUniqueCategories(feeds);
    container.append($("#categories-template").mustache({categories: categories}));
}

function getUniqueCategories(feeds){
    var categories = [];
    var addedIds = [];
    feeds.forEach(function(feed){
        feed.categories.forEach(function (category) {
            if (addedIds.indexOf(category.id) === -1) {
                categories.push(category);
                addedIds.push(category.id);
            }
        });
    });
    return categories;
}

function showLoader() {
    $("body").children("div").hide();
    $("#loading").show();
    resizeWindows();
}

function showLogin() {
    $("body").children("div").hide();
    $("#login").show();
    resizeWindows();
}

function showEmptyContent() {
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed-empty").text("No unread articles").show();
    $("#feedly").show().find("#all-read-section").hide();
    resizeWindows();
}

function showFeeds() {
    if (popupGlobal.backgroundPage.appGlobal.options.resetCounterOnClick) {
        popupGlobal.backgroundPage.resetCounter();
    }
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed").show();
    $("#feedly").show().find("#all-read-section").show().children().show();
    $(".mark-read").attr("title", "Mark as read");
    $(".show-content").attr("title", "More");
    resizeWindows();
}

function showSavedFeeds() {
    $("body").children("div").hide();
    $("#popup-content").show().children("div").hide().filter("#feed-saved").show().find(".mark-read").hide();
    $("#feed-saved").find(".show-content").attr("title", "More");
    $("#feedly").show().find("#all-read-section").children().hide().filter("#update-feeds").show();
    resizeWindows();
}

function setPopupExpand(isExpand){
    if (isExpand){
        $(".item").css("width", "700px");
        $(".article-title, .blog-title").css("width", $("#popup-content").hasClass("tabs") ? "645px" : "660px");
    } else {
        var popupContent = $("#popup-content");
        $(".item").css("width", popupContent.hasClass("tabs") ? "380px" : "350px");
        $(".article-title, .blog-title").css("width", popupContent.hasClass("tabs") ? "325px" : "310px");
    }
    resizeWindows();
}

function resizeWindows() {
    var maxHeight = 600;
    var body = $("body");
    var width = body.outerWidth(true);
    var height = body.outerHeight(true);
    if (height > maxHeight) {
        height = maxHeight;
        width += getScrollbarWidth();
    }
    height = height > maxHeight ? maxHeight : height;

    //For fix bug with scroll on Mac
    var margin = 4;

    safari.self.height = height;
    safari.self.width = width;
}

function getScrollbarWidth() {
    var div = document.createElement('div');

    div.style.overflowY = 'scroll';
    div.style.width =  '50px';
    div.style.height = '50px';

    div.style.visibility = 'hidden';

    document.body.appendChild(div);
    var scrollWidth = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);

    return scrollWidth;
}