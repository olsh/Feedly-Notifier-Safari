"use strict";

var appGlobal = {
    feedlyApiClient: new FeedlyApiClient(),
    feedTab: null,
    icons: {
        default: "images/icon.png",
        inactive: "images/icon_inactive.png",
        defaultBig: "images/icon128.png"
    },
    options: {
        _updateInterval: 10, //minutes
        _popupWidth: 380,
        _expandedPopupWidth: 650,

        markReadOnClick: true,
        accessToken: "",
        refreshToken: "",
        showDesktopNotifications: true,
        showFullFeedContent: false,
        maxNotificationsCount: 1, // Safari supports only 1 notification at once
        openSiteOnIconClick: false,
        feedlyUserId: "",
        abilitySaveFeeds: false,
        maxNumberOfFeeds: 20,
        forceUpdateFeeds: false,
        useSecureConnection: true,
        expandFeeds: false,
        isFiltersEnabled: false,
        openFeedsInSameTab: false,
        openFeedsInBackground: true,
        filters: [],
        showCounter: true,
        oldestFeedsFirst: false,
        resetCounterOnClick: false,
        popupFontSize: 100, //percent
        showCategories: false,

        get updateInterval(){
            var minimumInterval = 10;
            return this._updateInterval >= minimumInterval ? this._updateInterval : minimumInterval;
        },
        set updateInterval(value) {
            return this._updateInterval = value;
        },
        get popupWidth() {
            var maxValue = 2000;
            var minValue = 380;
            if (this._popupWidth > maxValue ) {
                return maxValue;
        }
            if (this._popupWidth < minValue){
                return minValue;
            }
            return this._popupWidth;
    },
        set popupWidth(value) {
            this._popupWidth = value;
        },
        get expandedPopupWidth() {
            var maxValue = 2000;
            var minValue = 380;
            if (this._expandedPopupWidth > maxValue ) {
                return maxValue;
            }
            if (this._expandedPopupWidth < minValue){
                return minValue;
            }
            return this._expandedPopupWidth;
        },
        set expandedPopupWidth(value) {
            this._expandedPopupWidth = value;
        }
    },
    //Names of options after changes of which scheduler will be initialized
    criticalOptionNames: ["updateInterval", "accessToken", "showFullFeedContent", "openSiteOnIconClick", "maxNumberOfFeeds", "abilitySaveFeeds", "filters", "isFiltersEnabled", "showCounter", "oldestFeedsFirst", "resetCounterOnClick"],
    cachedFeeds: [],
    cachedSavedFeeds: [],
    isLoggedIn: false,
    intervalIds: [],
    clientId: "",
    clientSecret: "",
    tokenIsRefreshing: false,
    get feedlyUrl(){
        return this.options.useSecureConnection ? "https://feedly.com" : "http://feedly.com"
    },
    get savedGroup(){
        return "user/" + this.options.feedlyUserId + "/tag/global.saved";
    },
    get globalGroup(){
        return "user/" + this.options.feedlyUserId + "/category/global.all";
    },
    get globalUncategorized(){
        return "user/" + this.options.feedlyUserId + "/category/global.uncategorized";
    },
    get toolbarButton() {
        return safari.extension.toolbarItems[0];
    },
    get openFeedlyWebsiteCommand() {
        return "open-feedly-website";
    }
};

(function () {
    // Read all options from the web storage
    readOptions();
    // Write default options to the web storage
    writeOptions(initialize);
})();

/* Listeners */
safari.application.addEventListener("message", function (event) {
    switch (event.name) {
        case "optionsLoaded" :
            safari.application.activeBrowserWindow.activeTab.page.dispatchMessage("options", appGlobal.options);
            loadCategories();
            loadProfileData();
            break;
        case "optionsSaved" :
            appGlobal.options = event.message;
            writeOptions(initialize);
            break;
        case "logout" :
            logout();
            break;
    }
}, false);

safari.application.addEventListener("command", function (event) {
    if (event.command !== appGlobal.openFeedlyWebsiteCommand){
        return;
    }
    if (appGlobal.isLoggedIn) {
        openFeedlyTab();
        if (appGlobal.options.resetCounterOnClick) {
            resetCounter();
        }
    } else {
        getAccessToken();
    }
}, false);

safari.extension.settings.addEventListener("change", openOptionsPage, false);

/* Initialization all parameters and run feeds check */
function initialize() {
    if (appGlobal.options.openSiteOnIconClick) {
        appGlobal.toolbarButton.command = appGlobal.openFeedlyWebsiteCommand;
    } else {
        appGlobal.toolbarButton.command = "";
    }
    appGlobal.feedlyApiClient.accessToken = appGlobal.options.accessToken;

    startSchedule(appGlobal.options.updateInterval);
}

function startSchedule(updateInterval) {
    stopSchedule();
    updateCounter();
    updateFeeds();
    if(appGlobal.options.showCounter){
        appGlobal.intervalIds.push(setInterval(updateCounter, updateInterval * 60000));
    }
    if (appGlobal.options.showDesktopNotifications || !appGlobal.options.openSiteOnIconClick) {
        appGlobal.intervalIds.push(setInterval(updateFeeds, updateInterval * 60000));
    }
}

function stopSchedule() {
    appGlobal.intervalIds.forEach(function(intervalId){
        clearInterval(intervalId);
    });
    appGlobal.intervalIds = [];
}

function logout() {
    appGlobal.options.accessToken = "";
    appGlobal.options.refreshToken = "";
    writeOptions(initialize);
}

/* Sends desktop notifications */
function sendDesktopNotification(feeds) {
    var notifications = [];
    //if notifications too many, then to show only count
    if (feeds.length > appGlobal.options.maxNotificationsCount) {
        //We can detect only limit count of new feeds at time, but actually count of feeds may be more
        var count = feeds.length === appGlobal.options.maxNumberOfFeeds ? "many" : feeds.length.toString();
        var notification = new Notification("New feeds", {
            icon: safari.extension.baseURI + appGlobal.icons.defaultBig,
            body: "You have " + count + " new feeds"
        });
        notifications.push(notification);
    } else {
        for (var i = 0; i < feeds.length; i++) {
            var notification = new Notification(feeds[i].blog, {
                icon: feeds[i].blogIcon,
                body: feeds[i].title
            });

            //Open new tab on click and close notification
            notification.url = feeds[i].url;
            notification.feedId = feeds[i].id;
            notification.onclick = function (e) {
                var target = e.target;
                target.cancel();
                openUrlInNewTab(target.url, true);
                if (appGlobal.options.markReadOnClick) {
                    markAsRead([target.feedId]);
                }
            };
            notifications.push(notification);
        }
    }
}

/* Opens new tab */
function openUrlInNewTab(url, active, isFeed) {
    var visibility = active ? "foreground" : "background";
    var tab = safari.application.activeBrowserWindow.openTab(visibility);
    tab.url = url;

    if (isFeed) {
        appGlobal.feedTab = tab;

        tab.addEventListener("close", function() {
            appGlobal.feedTab = null;
        }, false);
    }
}

/* Opens new Feedly tab, if tab was already opened, then switches on it and reload. */
function openFeedlyTab() {
    var tab = safari.application.activeBrowserWindow.openTab("foreground");
    tab.url = appGlobal.feedlyUrl;
}

function openOptionsPage () {
    var tab = safari.application.activeBrowserWindow.openTab("foreground");
    tab.url = safari.extension.baseURI + "options.html";
}

/* Removes feeds from cache by feed ID */
function removeFeedFromCache(feedId) {
    var indexFeedForRemove;
    for (var i = 0; i < appGlobal.cachedFeeds.length; i++) {
        if (appGlobal.cachedFeeds[i].id === feedId) {
            indexFeedForRemove = i;
            break;
        }
    }

    //Remove feed from cached feeds
    if (indexFeedForRemove !== undefined) {
        appGlobal.cachedFeeds.splice(indexFeedForRemove, 1);
    }
}

/* Returns only new feeds and set date of last feed
 * The callback parameter should specify a function that looks like this:
 * function(object newFeeds) {...};*/
function filterByNewFeeds(feeds, callback) {
    var lastFeedTimeTicks = localStorage.getItem("lastFeedTimeTicks");
    var lastFeedTime;

    if (lastFeedTimeTicks) {
        lastFeedTime = new Date(lastFeedTimeTicks);
    } else {
        lastFeedTime = new Date(1971, 0, 1);
    }

    var newFeeds = [];
    var maxFeedTime = lastFeedTime;

    for (var i = 0; i < feeds.length; i++) {
        if (feeds[i].date > lastFeedTime) {
            newFeeds.push(feeds[i]);
            if (feeds[i].date > maxFeedTime) {
                maxFeedTime = feeds[i].date;
            }
        }
    }

    localStorage.setItem("lastFeedTimeTicks", maxFeedTime.getTime());
    if (typeof callback === "function") {
        callback(newFeeds);
    }
}

function resetCounter(){
    setBadgeCounter(0);
    localStorage.setItem("lastCounterResetTime", new Date().getTime());
}

/* Update saved feeds and stores its in cache */
function updateSavedFeeds(callback) {
    apiRequestWrapper("streams/" + encodeURIComponent(appGlobal.savedGroup) + "/contents", {
        onSuccess: function (response) {
            appGlobal.cachedSavedFeeds = parseFeeds(response);
            if (typeof callback === "function") {
                callback();
            }
        }
    });
}

/* Sets badge counter if unread feeds more than zero */
function setBadgeCounter(unreadFeedsCount) {
    appGlobal.toolbarButton.badge = unreadFeedsCount;
}

/* Runs feeds update and stores unread feeds in cache
 * Callback will be started after function complete
 * */
function updateCounter() {
    if (appGlobal.options.resetCounterOnClick) {
        var lastCounterResetTime = localStorage.getItem("lastCounterResetTime");
        if (lastCounterResetTime) {
            var parameters = {
                newerThan: lastCounterResetTime
            };
        }
        makeMarkersRequest(parameters);
    } else {
        localStorage.setItem("lastCounterResetTime", new Date(0).getTime());
        makeMarkersRequest();
    }

    function makeMarkersRequest(parameters){
        apiRequestWrapper("markers/counts", {
            parameters: parameters,
            onSuccess: function (response) {
                var unreadCounts = response.unreadcounts;
                var unreadFeedsCount = 0;

                if (appGlobal.options.isFiltersEnabled) {
                    apiRequestWrapper("subscriptions", {
                        onSuccess: function (response) {
                            unreadCounts.forEach(function (element) {
                                if (appGlobal.options.filters.indexOf(element.id) !== -1) {
                                    unreadFeedsCount += element.count;
                                }
                            });

                            // When feed consists in more than one category, we remove feed which was counted twice or more
                            response.forEach(function (feed) {
                                var numberOfDupesCategories = 0;
                                feed.categories.forEach(function(category){
                                    if(appGlobal.options.filters.indexOf(category.id) !== -1){
                                        numberOfDupesCategories++;
                                    }
                                });
                                if(numberOfDupesCategories > 1){
                                    for (var i = 0; i < unreadCounts.length; i++) {
                                        if (feed.id === unreadCounts[i].id) {
                                            unreadFeedsCount -= unreadCounts[i].count * --numberOfDupesCategories;
                                            break;
                                        }
                                    }
                                }
                            });

                            setBadgeCounter(unreadFeedsCount);
                        }
                    });
                } else {
                    for (var i = 0; i < unreadCounts.length; i++) {
                        if (appGlobal.globalGroup === unreadCounts[i].id) {
                            unreadFeedsCount = unreadCounts[i].count;
                            break;
                        }
                    }

                    setBadgeCounter(unreadFeedsCount);
                }
            }
        });
    }
}

/* Runs feeds update and stores unread feeds in cache
 * Callback will be started after function complete
 * If silentUpdate is true, then notifications will not be shown
 *  */
function updateFeeds(callback, silentUpdate){
    appGlobal.cachedFeeds = [];
    appGlobal.options.filters = appGlobal.options.filters || [];

    var streamIds = appGlobal.options.isFiltersEnabled && appGlobal.options.filters.length ? appGlobal.options.filters : [appGlobal.globalGroup];

    var requestCount = streamIds.length;
    for(var i = 0; i < streamIds.length; i++){
        apiRequestWrapper("streams/" + encodeURIComponent(streamIds[i]) + "/contents", {
            timeout: 7000, // Prevent infinite loading
            parameters: {
                unreadOnly: true,
                count: appGlobal.options.maxNumberOfFeeds,
                ranked: appGlobal.options.oldestFeedsFirst ? "oldest" : "newest"
            },
            onSuccess: function (response) {
                requestCount--;

                appGlobal.cachedFeeds = appGlobal.cachedFeeds.concat(parseFeeds(response));
                // When all request are completed
                if (requestCount < 1) {

                    // Remove duplicates
                    appGlobal.cachedFeeds = appGlobal.cachedFeeds.filter(function(value, index, feeds){
                        for(var i = ++index; i < feeds.length; i++){
                            if(feeds[i].id == value.id){
                                return false;
                            }
                        }
                        return true;
                    });

                    appGlobal.cachedFeeds = appGlobal.cachedFeeds.sort(function (a, b) {
                        if (a.date > b.date) {
                            return appGlobal.options.oldestFeedsFirst ? 1 : -1;
                        } else if (a.date < b.date) {
                            return appGlobal.options.oldestFeedsFirst ? -1 : 1;
                        }
                        return 0;
                    });

                    appGlobal.cachedFeeds = appGlobal.cachedFeeds.splice(0, appGlobal.options.maxNumberOfFeeds);
                    filterByNewFeeds(appGlobal.cachedFeeds, function (newFeeds) {
                        if (appGlobal.options.showDesktopNotifications && !silentUpdate) {
                            sendDesktopNotification(newFeeds);
                        }
                    });
                }
            },
            onComplete: function () {
                if (typeof callback === "function") {
                    callback();
                }
            }
        });
    }
}

/* Stops scheduler, sets badge as inactive and resets counter */
function setInactiveStatus() {
    appGlobal.toolbarButton.image = safari.extension.baseURI + appGlobal.icons.inactive;
    setBadgeCounter(0);
    appGlobal.cachedFeeds = [];
    appGlobal.isLoggedIn = false;
    appGlobal.options.feedlyUserId = "";
    stopSchedule();
}

/* Sets badge as active */
function setActiveStatus() {
    appGlobal.toolbarButton.image = safari.extension.baseURI + appGlobal.icons.default;
    appGlobal.isLoggedIn = true;
}

/* Converts feedly response to feeds */
function parseFeeds(feedlyResponse) {
    var feeds = feedlyResponse.items.map(function (item) {

        var blogUrl;
        try {
            blogUrl = item.origin.htmlUrl.match(/http(?:s)?:\/\/[^/]+/i).pop();
        } catch (exception) {
            blogUrl = "#";
        }

        //Set content
        var content;
        var contentDirection;
        if (appGlobal.options.showFullFeedContent) {
            if (item.content !== undefined) {
                content = item.content.content;
                contentDirection = item.content.direction;
            }
        }

        if (!content) {
            if (item.summary !== undefined) {
                content = item.summary.content;
                contentDirection = item.summary.direction;
            }
        }

        //Set title
        var title;
        var titleDirection;
        if (item.title) {
            if (item.title.indexOf("direction:rtl") !== -1) {
                //Feedly wraps rtl titles in div, we remove div because desktopNotification supports only text
                title = item.title.replace(/<\/?div.*?>/gi, "");
                titleDirection = "rtl";
            } else {
                title = item.title;
            }
        }

        var isSaved;
        if (item.tags) {
            for (var i = 0; i < item.tags.length; i++) {
                if (item.tags[i].id.search(/global\.saved$/i) !== -1) {
                    isSaved = true;
                    break;
                }
            }
        }

        var blog;
        var blogTitleDirection;
        if (item.origin && item.origin.title) {
            if (item.origin.title.indexOf("direction:rtl") !== -1) {
                //Feedly wraps rtl titles in div, we remove div because desktopNotification supports only text
                blog = item.origin.title.replace(/<\/?div.*?>/gi, "");
                blogTitleDirection = "rtl";
            } else {
                blog = item.origin.title;
            }
        }

        var categories = [];
        if (item.categories) {
            categories = item.categories.map(function (category){
                return {
                    id: category.id,
                    encodedId: encodeURI(category.id),
                    label: category.label
                };
            });
        }

        return {
            title: title,
            titleDirection: titleDirection,
            url: item.alternate ? item.alternate[0] ? item.alternate[0].href : "" : "",
            blog: blog,
            blogTitleDirection: blogTitleDirection,
            blogUrl: blogUrl,
            blogIcon: "https://www.google.com/s2/favicons?domain=" + blogUrl + "&alt=feed",
            id: item.id,
            content: content,
            contentDirection: contentDirection,
            isoDate: item.crawled ? new Date(item.crawled).toISOString() : "",
            date: item.crawled ? new Date(item.crawled) : "",
            isSaved: isSaved,
            categories: categories,
            author: item.author
        };
    });
    return feeds;
}

/* Returns feeds from the cache.
 * If the cache is empty, then it will be updated before return
 * forceUpdate, when is true, then cache will be updated
 */
function getFeeds(forceUpdate, callback) {
    if (appGlobal.cachedFeeds.length > 0 && !forceUpdate) {
        callback(appGlobal.cachedFeeds.slice(0), appGlobal.isLoggedIn);
    } else {
        updateFeeds(function () {
            callback(appGlobal.cachedFeeds.slice(0), appGlobal.isLoggedIn);
        }, true);
        updateCounter();
    }
}

/* Returns saved feeds from the cache.
 * If the cache is empty, then it will be updated before return
 * forceUpdate, when is true, then cache will be updated
 */
function getSavedFeeds(forceUpdate, callback) {
    if (appGlobal.cachedSavedFeeds.length > 0 && !forceUpdate) {
        callback(appGlobal.cachedSavedFeeds.slice(0), appGlobal.isLoggedIn);
    } else {
        updateSavedFeeds(function () {
            callback(appGlobal.cachedSavedFeeds.slice(0), appGlobal.isLoggedIn);
        }, true);
    }
}

/* Marks feed as read, remove it from the cache and decrement badge.
 * array of the ID of feeds
 * The callback parameter should specify a function that looks like this:
 * function(boolean isLoggedIn) {...};*/
function markAsRead(feedIds, callback) {
    apiRequestWrapper("markers", {
        body: {
            action: "markAsRead",
            type: "entries",
            entryIds: feedIds
        },
        method: "POST",
        onSuccess: function () {
            for (var i = 0; i < feedIds.length; i++) {
                removeFeedFromCache(feedIds[i]);
            }
            var feedsCount = appGlobal.toolbarButton.badge;
                feedsCount = +feedsCount;
                if (feedsCount > 0) {
                    feedsCount -= feedIds.length;
                    setBadgeCounter(feedsCount);
                }
            if (typeof callback === "function") {
                callback(true);
            }
        },
        onAuthorizationRequired: function () {
            if (typeof callback === "function") {
                callback(false);
            }
        }
    });
}

/* Save feed or unsave it.
 * feed ID
 * if saveFeed is true, then save feed, else unsafe it
 * The callback parameter should specify a function that looks like this:
 * function(boolean isLoggedIn) {...};*/
function toggleSavedFeed(feedId, saveFeed, callback) {
    if (saveFeed) {
        apiRequestWrapper("tags/" + encodeURIComponent(appGlobal.savedGroup), {
            method: "PUT",
            body: {
                entryId: feedId
            },
            onSuccess: function (response) {
                if (typeof callback === "function") {
                    callback(true);
                }
            },
            onAuthorizationRequired: function () {
                if (typeof callback === "function") {
                    callback(false);
                }
            }
        });
    } else {
        apiRequestWrapper("tags/" + encodeURIComponent(appGlobal.savedGroup) + "/" + encodeURIComponent(feedId), {
            method: "DELETE",
            onSuccess: function (response) {
                if (typeof callback === "function") {
                    callback(true);
                }
            },
            onAuthorizationRequired: function () {
                if (typeof callback === "function") {
                    callback(false);
                }
            }
        });
    }

    //Update state in the cache
    for (var i = 0; i < appGlobal.cachedFeeds.length; i++) {
        if (appGlobal.cachedFeeds[i].id === feedId) {
            appGlobal.cachedFeeds[i].isSaved = saveFeed;
            break;
        }
    }
}

function loadCategories(){
    apiRequestWrapper("categories", {
        onSuccess: function (result) {
            result.push({id: appGlobal.globalUncategorized, label: "Uncategorized"});
            result.forEach(function(element){
                if (appGlobal.options.filters.indexOf(element.id) !== -1){
                    element.checked = true;
                }
            });
            safari.application.activeBrowserWindow.activeTab.page.dispatchMessage("userCategories", result);
        }
    });
}

function loadProfileData () {
    apiRequestWrapper("profile", {
        useSecureConnection: appGlobal.options.useSecureConnection,
        onSuccess: function (result) {
            sendProfileData(result);
        },
        onAuthorizationRequired: function () {
            sendProfileData(null);
        }
    });

    function sendProfileData (result) {
        safari.application.activeBrowserWindow.activeTab.page.dispatchMessage("userProfile", result);
    }
}

/* Runs authenticating a user process,
 * then read access token and stores in web storage */
function getAccessToken() {
    var state = (new Date()).getTime();
    var url = appGlobal.feedlyApiClient.getMethodUrl("auth/auth", {
        response_type: "code",
        client_id: appGlobal.clientId,
        redirect_uri: "http://localhost",
        scope: "https://cloud.feedly.com/subscriptions",
        state: state
    }, appGlobal.options.useSecureConnection);

    var tab = safari.application.activeBrowserWindow.openTab();
    tab.url = url;

    safari.application.addEventListener("beforeNavigate", requestTokenHandler, true);

    function requestTokenHandler (event) {

        var checkStateRegex = new RegExp("state=" + state);
        if (!checkStateRegex.test(event.url)) {
            return;
        }

        var codeParse = /code=(.+?)(?:&|$)/i;
        var matches = codeParse.exec(event.url);
        if (matches) {
            appGlobal.feedlyApiClient.request("auth/token", {
                method: "POST",
                useSecureConnection: appGlobal.options.useSecureConnection,
                parameters: {
                    code: matches[1],
                    client_id: appGlobal.clientId,
                    client_secret: appGlobal.clientSecret,
                    redirect_uri: "http://localhost",
                    grant_type: "authorization_code"
                },
                onSuccess: function (response) {
                    appGlobal.options.accessToken = response.access_token;
                    appGlobal.options.refreshToken = response.refresh_token;
                    appGlobal.options.feedlyUserId = response.id;
                    localStorage.setItem("options", appGlobal.options);
                    writeOptions(initialize);
                    safari.application.removeEventListener("beforeNavigate", requestTokenHandler, true);
                    tab.url = safari.extension.baseURI + "options.html";
                }
            });
        }
    }

}

/* Tries refresh access token if possible */
function refreshAccessToken(){
    if(!appGlobal.options.refreshToken) return;

    appGlobal.feedlyApiClient.request("auth/token", {
        method: "POST",
        useSecureConnection: appGlobal.options.useSecureConnection,
        parameters: {
            refresh_token: appGlobal.options.refreshToken,
            client_id: appGlobal.clientId,
            client_secret: appGlobal.clientSecret,
            grant_type: "refresh_token"
        },
        onSuccess: function (response) {
            appGlobal.options.accessToken = response.access_token;
            appGlobal.options.feedlyUserId = response.id;
            writeOptions(initialize);
        },
        onComplete: function(){
            appGlobal.tokenIsRefreshing = false;
        }
    });
}

/* Writes all application options in web storage and runs callback after it */
function writeOptions(callback) {
    localStorage.setItem("options", JSON.stringify(appGlobal.options));

    if (typeof callback === "function") {
        callback();
    }
}

/* Reads all options from web storage and runs callback after it */
function readOptions(callback) {
    var options;
    try {
        options = JSON.parse(localStorage.getItem("options"));
    }
    catch (exception){
        options = {};
    }

    for (var optionName in options) {
        if (typeof appGlobal.options[optionName] === "boolean") {
            appGlobal.options[optionName] = Boolean(options[optionName]);
        } else if (typeof appGlobal.options[optionName] === "number") {
            appGlobal.options[optionName] = Number(options[optionName]);
        } else {
            appGlobal.options[optionName] = options[optionName];
        }
    }
    if (typeof callback === "function") {
        callback();
    }
}

function apiRequestWrapper(methodName, settings) {
    var onSuccess = settings.onSuccess;
    settings.onSuccess = function (response) {
        setActiveStatus();
        if (typeof onSuccess === "function") {
            onSuccess(response);
        }
    };

    var onAuthorizationRequired = settings.onAuthorizationRequired;

    settings.onAuthorizationRequired = function (accessToken) {
        if (appGlobal.isLoggedIn) {
            setInactiveStatus();
        }
        if (!appGlobal.tokenIsRefreshing){
            appGlobal.tokenIsRefreshing = true;
            refreshAccessToken();
        }
        if (typeof onAuthorizationRequired === "function") {
            onAuthorizationRequired(accessToken);
        }
    };

    appGlobal.feedlyApiClient.request(methodName, settings);
}