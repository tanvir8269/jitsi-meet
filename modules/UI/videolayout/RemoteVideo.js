/* global $, APP, interfaceConfig */

import ConnectionIndicator from './ConnectionIndicator';

import SmallVideo from "./SmallVideo";
import AudioLevels from "../audio_levels/AudioLevels";
import UIUtils from "../util/UIUtil";
import UIEvents from '../../../service/UI/UIEvents';

var RTCBrowserType = require("../../RTC/RTCBrowserType");

function RemoteVideo(id, VideoLayout, emitter) {
    this.id = id;
    this.emitter = emitter;
    this.videoSpanId = `participant_${id}`;
    this.VideoLayout = VideoLayout;
    this.addRemoteVideoContainer();
    this.connectionIndicator = new ConnectionIndicator(this, id);
    this.setDisplayName();
    var nickfield = document.createElement('span');
    nickfield.className = "nick";
    nickfield.appendChild(document.createTextNode(id));
    this.container.appendChild(nickfield);
    this.bindHoverHandler();
    this.flipX = false;
    this.isLocal = false;
    SmallVideo.call(this);
}

RemoteVideo.prototype = Object.create(SmallVideo.prototype);
RemoteVideo.prototype.constructor = RemoteVideo;

RemoteVideo.prototype.addRemoteVideoContainer = function() {
    this.container = RemoteVideo.createContainer(this.videoSpanId);
    if (APP.conference.isModerator) {
        this.addRemoteVideoMenu();
    }
    let {thumbWidth, thumbHeight} = this.VideoLayout.calculateThumbnailSize();
    AudioLevels.updateAudioLevelCanvas(this.id, thumbWidth, thumbHeight);

    return this.container;
};

/**
 * Adds the remote video menu element for the given <tt>id</tt> in the
 * given <tt>parentElement</tt>.
 *
 * @param id the id indicating the video for which we're adding a menu.
 * @param parentElement the parent element where this menu will be added
 */

if (!interfaceConfig.filmStripOnly) {
    RemoteVideo.prototype.addRemoteVideoMenu = function () {
        var spanElement = document.createElement('span');
        spanElement.className = 'remotevideomenu';

        this.container.appendChild(spanElement);

        var menuElement = document.createElement('i');
        menuElement.className = 'fa fa-angle-down';
        menuElement.title = 'Remote user controls';
        spanElement.appendChild(menuElement);


        var popupmenuElement = document.createElement('ul');
        popupmenuElement.className = 'popupmenu';
        popupmenuElement.id = `remote_popupmenu_${this.id}`;
        spanElement.appendChild(popupmenuElement);

        var muteMenuItem = document.createElement('li');
        var muteLinkItem = document.createElement('a');

        var mutedIndicator = "<i style='float:left;' " +
            "class='icon-mic-disabled'></i>";

        if (!this.isMuted) {
            muteLinkItem.innerHTML = mutedIndicator +
                " <div style='width: 90px;margin-left: 20px;' " +
                "data-i18n='videothumbnail.domute'></div>";
            muteLinkItem.className = 'mutelink';
        }
        else {
            muteLinkItem.innerHTML = mutedIndicator +
                " <div style='width: 90px;margin-left: 20px;' " +
                "data-i18n='videothumbnail.muted'></div>";
            muteLinkItem.className = 'mutelink disabled';
        }

        var self = this;
        muteLinkItem.onclick = function(){
            if ($(this).attr('disabled')) {
                event.preventDefault();
            }
            var isMute = !!self.isMuted;
            self.emitter.emit(UIEvents.REMOTE_AUDIO_MUTED, self.id);

            popupmenuElement.setAttribute('style', 'display:none;');

            if (isMute) {
                this.innerHTML = mutedIndicator +
                    " <div style='width: 90px;margin-left: 20px;' " +
                    "data-i18n='videothumbnail.muted'></div>";
                this.className = 'mutelink disabled';
            }
            else {
                this.innerHTML = mutedIndicator +
                    " <div style='width: 90px;margin-left: 20px;' " +
                    "data-i18n='videothumbnail.domute'></div>";
                this.className = 'mutelink';
            }
        };

        muteMenuItem.appendChild(muteLinkItem);
        popupmenuElement.appendChild(muteMenuItem);

        var ejectIndicator = "<i style='float:left;' class='fa fa-eject'></i>";

        var ejectMenuItem = document.createElement('li');
        var ejectLinkItem = document.createElement('a');
        var ejectText = "<div style='width: 90px;margin-left: 20px;' " +
            "data-i18n='videothumbnail.kick'>&nbsp;</div>";
        ejectLinkItem.innerHTML = ejectIndicator + ' ' + ejectText;
        ejectLinkItem.onclick = function(){
            self.emitter.emit(UIEvents.USER_KICKED, self.id);
            popupmenuElement.setAttribute('style', 'display:none;');
        };

        ejectMenuItem.appendChild(ejectLinkItem);
        popupmenuElement.appendChild(ejectMenuItem);

        var paddingSpan = document.createElement('span');
        paddingSpan.className = 'popupmenuPadding';
        popupmenuElement.appendChild(paddingSpan);
        APP.translation.translateElement(
            $("#" + popupmenuElement.id + " > li > a > div"));
    };

} else {
    RemoteVideo.prototype.addRemoteVideoMenu = function() {};
}

/**
 * Removes the remote stream element corresponding to the given stream and
 * parent container.
 *
 * @param stream the stream
 * @param isVideo <tt>true</tt> if given <tt>stream</tt> is a video one.
 */
RemoteVideo.prototype.removeRemoteStreamElement =
    function (stream, isVideo, id) {
    if (!this.container)
        return false;

    var select = null;
    if (isVideo) {
        select = $('#' + id);
    }
    else
        select = $('#' + this.videoSpanId + '>audio');

    select.remove();

    console.info((isVideo ? "Video" : "Audio") +
                 " removed " + this.id, select);

    if (isVideo)
        this.VideoLayout.updateRemovedVideo(this.id);
};

/**
 * Removes RemoteVideo from the page.
 */
RemoteVideo.prototype.remove = function () {
    console.log("Remove thumbnail", this.id);
    this.removeConnectionIndicator();
    // Make sure that the large video is updated if are removing its
    // corresponding small video.
    this.VideoLayout.updateRemovedVideo(this.id);
    // Remove whole container
    if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
    }
};

RemoteVideo.prototype.waitForPlayback = function (sel, stream) {

    var webRtcStream = stream.getOriginalStream();
    var isVideo = stream.isVideoTrack();
    if (!isVideo || webRtcStream.id === 'mixedmslabel') {
        return;
    }

    var self = this;

    // Register 'onplaying' listener to trigger 'videoactive' on VideoLayout
    // when video playback starts
    var onPlayingHandler = function () {
        // FIXME: why do i have to do this for FF?
        if (RTCBrowserType.isFirefox()) {
            //FIXME: weshould use the lib here
            //APP.RTC.attachMediaStream(sel, webRtcStream);
        }
        if (RTCBrowserType.isTemasysPluginUsed()) {
            sel = self.selectVideoElement();
        }
        self.VideoLayout.videoactive(sel, self.id);
        sel[0].onplaying = null;
        if (RTCBrowserType.isTemasysPluginUsed()) {
            // 'currentTime' is used to check if the video has started
            // and the value is not set by the plugin, so we do it
            sel[0].currentTime = 1;
        }
    };
    sel[0].onplaying = onPlayingHandler;
};

RemoteVideo.prototype.addRemoteStreamElement = function (stream) {
    if (!this.container) {
        return;
    }

    this.stream = stream;

    let isVideo = stream.isVideoTrack();

    // Add click handler.
    let onClickHandler = (event) => {

        this.VideoLayout.handleVideoThumbClicked(false, this.id);

        // On IE we need to populate this handler on video <object>
        // and it does not give event instance as an argument,
        // so we check here for methods.
        if (event.stopPropagation && event.preventDefault) {
            event.stopPropagation();
            event.preventDefault();
        }
        return false;
    };
    this.container.onclick = onClickHandler;

    if(!stream.getOriginalStream())
        return;

    let streamElement = SmallVideo.createStreamElement(stream);
    let newElementId = streamElement.id;

    // Put new stream element always in front
    UIUtils.prependChild(this.container, streamElement);

    let sel = $(`#${newElementId}`);
    sel.hide();

    // If the container is currently visible we attach the stream.
    if (!isVideo || (this.container.offsetParent !== null && isVideo)) {
        this.waitForPlayback(sel, stream);

        stream.attach(sel);
    }

    // reselect
    if (RTCBrowserType.isTemasysPluginUsed()) {
        sel = $(`#${newElementId}`);
    }
    sel.click(onClickHandler);
},

/**
 * Show/hide peer container for the given id.
 */
RemoteVideo.prototype.showPeerContainer = function (state) {
    if (!this.container)
        return;

    var isHide = state === 'hide';
    var resizeThumbnails = false;

    if (!isHide) {
        if (!$(this.container).is(':visible')) {
            resizeThumbnails = true;
            $(this.container).show();
        }
        // Call updateView, so that we'll figure out if avatar
        // should be displayed based on video muted status and whether or not
        // it's in the lastN set
        this.updateView();
    }
    else if ($(this.container).is(':visible') && isHide)
    {
        resizeThumbnails = true;
        $(this.container).hide();
        if(this.connectionIndicator)
            this.connectionIndicator.hide();
    }

    if (resizeThumbnails) {
        this.VideoLayout.resizeThumbnails();
    }

    // We want to be able to pin a participant from the contact list, even
    // if he's not in the lastN set!
    // ContactList.setClickable(id, !isHide);

};

RemoteVideo.prototype.updateResolution = function (resolution) {
    if (this.connectionIndicator) {
        this.connectionIndicator.updateResolution(resolution);
    }
};

RemoteVideo.prototype.removeConnectionIndicator = function () {
    if (this.connectionIndicator)
        this.connectionIndicator.remove();
};

RemoteVideo.prototype.hideConnectionIndicator = function () {
    if (this.connectionIndicator)
        this.connectionIndicator.hide();
};

/**
 * Updates the remote video menu.
 *
 * @param id the id indicating the video for which we're adding a menu.
 * @param isMuted indicates the current mute state
 */
RemoteVideo.prototype.updateRemoteVideoMenu = function (isMuted) {
    var muteMenuItem = $(`#remote_popupmenu_${this.id}>li>a.mutelink`);

    var mutedIndicator = "<i class='icon-mic-disabled'></i>";

    if (muteMenuItem.length) {
        var muteLink = muteMenuItem.get(0);

        if (isMuted) {
            muteLink.innerHTML = mutedIndicator + ' Muted';
            muteLink.className = 'mutelink disabled';
        }
        else {
            muteLink.innerHTML = mutedIndicator + ' Mute';
            muteLink.className = 'mutelink';
        }
    }
};

/**
 * Updates the Indicator for dominant speaker.
 *
 * @param isSpeaker indicates the current indicator state
 */
RemoteVideo.prototype.updateDominantSpeakerIndicator = function (isSpeaker) {

    if (!this.container) {
        console.warn( "Unable to set dominant speaker indicator - "
            + this.videoSpanId + " does not exist");
        return;
    }

    var indicatorSpan
        = $('#' + this.videoSpanId + '>span.dominantspeakerindicator');

    // If we do not have an indicator for this video.
    if (indicatorSpan.length <= 0) {
        indicatorSpan = document.createElement('span');

        indicatorSpan.innerHTML
            = "<i id='speakerindicatoricon' class='fa fa-bullhorn'></i>";
        indicatorSpan.className = 'dominantspeakerindicator';

        $('#' + this.videoSpanId)[0].appendChild(indicatorSpan);

        // adds a tooltip
        UIUtils.setTooltip(indicatorSpan, "speaker", "left");
        APP.translation.translateElement($(indicatorSpan));
    }

    $(indicatorSpan).css("visibility", isSpeaker ? "visible" : "hidden");
};


/**
 * Sets the display name for the given video span id.
 */
RemoteVideo.prototype.setDisplayName = function(displayName, key) {

    if (!this.container) {
        console.warn( "Unable to set displayName - " + this.videoSpanId +
                " does not exist");
        return;
    }

    var nameSpan = $('#' + this.videoSpanId + '>span.displayname');

    // If we already have a display name for this video.
    if (nameSpan.length > 0) {
        if (displayName && displayName.length > 0) {
            $('#' + this.videoSpanId + '_name').html(displayName);
        }
        else if (key && key.length > 0) {
            var nameHtml = APP.translation.generateTranslationHTML(key);
            $('#' + this.videoSpanId + '_name').html(nameHtml);
        }
        else
            $('#' + this.videoSpanId + '_name').text(
                interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME);
    } else {
        nameSpan = document.createElement('span');
        nameSpan.className = 'displayname';
        $('#' + this.videoSpanId)[0].appendChild(nameSpan);

        if (displayName && displayName.length > 0) {
            nameSpan.innerHTML = displayName;
        }
        else
            nameSpan.innerHTML = interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME;
        nameSpan.id = this.videoSpanId + '_name';
    }
};

/**
 * Removes remote video menu element from video element identified by
 * given <tt>videoElementId</tt>.
 *
 * @param videoElementId the id of local or remote video element.
 */
RemoteVideo.prototype.removeRemoteVideoMenu = function() {
    var menuSpan = $('#' + this.videoSpanId + '>span.remotevideomenu');
    if (menuSpan.length) {
        menuSpan.remove();
    }
};

RemoteVideo.createContainer = function (spanId) {
    var container = document.createElement('span');
    container.id = spanId;
    container.className = 'videocontainer';
    var remotes = document.getElementById('remoteVideos');
    return remotes.appendChild(container);
};


export default RemoteVideo;