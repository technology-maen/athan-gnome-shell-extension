import Geoclue from 'gi://Geoclue';
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PermissionStore from 'resource:///org/gnome/shell/misc/permissionStore.js';
import * as PrayTimes from './PrayTimes.js';
import * as HijriCalendarKuwaiti from './HijriCalendarKuwaiti.js';

const Azan = GObject.registerClass(
    class Azan extends PanelMenu.Button {

        _init() {
            super._init(0.5, _('Azan'));

            this.extensionObject = Extension.lookupByURL(import.meta.url);

            this.indicatorText = new St.Label({ text: _("Loading..."), y_align: Clutter.ActorAlign.CENTER });
            this.add_child(this.indicatorText);

            this._gclueLocationChangedId = 0;
            this._weatherAuthorized = false;

            this._opt_calculationMethod = null;
            this._opt_madhab = null;
            this._opt_latitude = null;
            this._opt_longitude = null;
            this._opt_timezone = null;
            this._opt_timeformat12 = false;
            this._opt_concise_list = null;
            this._opt_hijriDateAdjustment = null;

            this._settings = this.extensionObject.getSettings('org.gnome.shell.extensions.azan');
            this._bindSettings();
            this._loadSettings();

            this._dateFormatFull = _("%A %B %e, %Y");


            this._prayTimes = new PrayTimes.PrayTimes('MWL');


            this._dayNames = new Array("Ahad", "Ithnin", "Thulatha", "Arbiaa", "Khamees", "Jomuah", "Issabt");
            this._monthNames = new Array("Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir",
                "Jumadal Ula", "Jumadal Akhira", "Rajab", "Sha'ban",
                "Ramadhan", "Shawwal", "Dhul Qa'ada", "Dhul Hijja");

            this._timeNames = {
                fajr: 'Fajr',
                sunrise: 'Sunrise',
                dhuhr: 'Dhuhr',
                asr: 'Asr',
                sunset: 'Sunset',
                maghrib: 'Maghrib',
                isha: 'Isha',
                midnight: 'Midnight'
            };

            this._timeConciseLevels = {
                fajr: 1,
                sunrise: 0,
                dhuhr: 1,
                asr: 1,
                sunset: 0,
                maghrib: 1,
                isha: 1,
                midnight: 0
            };
                
            this._calcMethodsArr = ["MUI", "MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran"];
            this._madhabArr = ["Standard", "Hanafi"]
            this._timezoneArr = Array.from({ length: 27 }, (_, index) => (index - 12).toString());
            this._timezoneArr.unshift("auto");
            
            this._prayItems = {};

            this._dateMenuItem = new PopupMenu.PopupMenuItem(_("TODO"), {
                style_class: 'azan-panel', reactive: false, hover: false, activate: false
            });

            this.menu.addMenuItem(this._dateMenuItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            for (let prayerId in this._timeNames) {

                let prayerName = this._timeNames[prayerId];

                let prayMenuItem = new PopupMenu.PopupMenuItem(_(prayerName), {
                    reactive: false, hover: false, activate: false
                });

                let bin = new St.Bin({ x_expand: true, x_align: Clutter.ActorAlign.END });

                let prayLabel = new St.Label();
                bin.add_actor(prayLabel);

                prayMenuItem.actor.add_actor(bin);

                this.menu.addMenuItem(prayMenuItem);

                this._prayItems[prayerId] = { menuItem: prayMenuItem, label: prayLabel };
            };

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            //	making mordernize
            this.prefs_s = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            let l = new St.Label({ text: ' ' });
            l.x_expand = true;
            this.prefs_s.actor.add(l);
            this.prefs_b = new St.Button({ child: new St.Icon({ icon_name: 'preferences-system-symbolic', icon_size: 30 }), style_class: 'prefs_s_action' });

            this.prefs_b.connect('clicked', () => {
                this.extensionObject.openPreferences()
            });

            this.prefs_s.actor.add(this.prefs_b);
            l = new St.Label({ text: ' ' });
            l.x_expand = true;
            this.prefs_s.actor.add(l);

            this.menu.addMenuItem(this.prefs_s);

            this._updateLabelPeriodic();
            this._updatePrayerVisibility();

            this._permStore = new PermissionStore.PermissionStore((proxy, error) => {
                if (error) {
                    log('Failed to connect to permissionStore: ' + error.message);
                    return;
                }

                this._permStore.LookupRemote('gnome', 'geolocation', (res, error) => {
                    if (error)
                        log('Error looking up permission: ' + error.message);

                    let [perms, data] = error ? [{}, null] : res;
                    let params = ['gnome', 'geolocation', false, data, perms];
                    this._onPermStoreChanged(this._permStore, '', params);
                });
            });
        }

        _startGClueService() {
            if (this._gclueStarting)
                return;

            this._gclueStarting = true;

            Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.EXACT, null,
                (o, res) => {
                    try {
                        this._gclueService = Geoclue.Simple.new_finish(res);
                    } catch (e) {
                        log('Failed to connect to Geoclue2 service: ' + e.message);
                        return;
                    }
                    this._gclueStarted = true;
                    this._gclueService.get_client().distance_threshold = 100;
                    this._updateLocationMonitoring();
                });
        }

        _onPermStoreChanged(proxy, sender, params) {
            let [table, id, deleted, data, perms] = params;

            if (table != 'gnome' || id != 'geolocation')
                return;

            let permission = perms['org.gnome.Weather.Application'] || ['NONE'];
            let [accuracy] = permission;
            this._weatherAuthorized = accuracy != 'NONE';

            this._updateAutoLocation();
        }

        _onGClueLocationChanged() {
            let geoLocation = this._gclueService.location;
            this._opt_latitude = geoLocation.latitude;
            this._opt_longitude = geoLocation.longitude;
            this._settings.set_double('latitude', this._opt_latitude);
            this._settings.set_double('longitude', this._opt_longitude);
        }

        _updateLocationMonitoring() {
            if (this._opt_autoLocation) {
                if (this._gclueLocationChangedId != 0 || this._gclueService == null)
                    return;

                this._gclueLocationChangedId =
                    this._gclueService.connect('notify::location',
                        this._onGClueLocationChanged.bind(this));
                this._onGClueLocationChanged();
            } else {
                if (this._gclueLocationChangedId)
                    this._gclueService.disconnect(this._gclueLocationChangedId);
                this._gclueLocationChangedId = 0;
            }
        }

        _updateAutoLocation() {
            this._updateLocationMonitoring();

            if (this._opt_autoLocation) {
                this._startGClueService();
            }
        }

        _loadSettings() {
            this._opt_calculationMethod = this._settings.get_int('calculation-method');
            this._opt_madhab = this._settings.get_int('madhab');
            this._opt_autoLocation = this._settings.get_boolean('auto-location');
            this._updateAutoLocation();
            this._opt_latitude = this._settings.get_double('latitude');
            this._opt_longitude = this._settings.get_double('longitude');
            this._opt_timeformat12 = this._settings.get_boolean('time-format-12');
            this._opt_timezone = this._settings.get_int('timezone');
            this._opt_concise_list = this._settings.get_int('concise-list');
            this._opt_hijriDateAdjustment = this._settings.get_int('hijri-date-adjustment');
        }

        _bindSettings() {
            this._settings.connect('changed::' + 'auto-location', (settings, key) => {
                this._opt_autoLocation = settings.get_boolean(key);
                this._updateAutoLocation();
                this._updateLabel();
            });

            this._settings.connect('changed::' + 'calculation-method', (settings, key) => {
                this._opt_calculationMethod = settings.get_int(key);
                
                this._updateLabel();
            });

            this._settings.connect('changed::' + 'madhab', (settings, key) => {
                this._opt_madhab = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'latitude', (settings, key) => {
                this._opt_latitude = settings.get_double(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'longitude', (settings, key) => {
                this._opt_longitude = settings.get_double(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'time-format-12', (settings, key) => {
                this._opt_timeformat12 = settings.get_boolean(key);
                this._updateLabel();
            });
            this._settings.connect('changed::' + 'timezone', (settings, key) => {
                this._opt_timezone = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'concise-list', (settings, key) => {
                this._opt_concise_list = settings.get_int(key);
                this._updateLabel();
                this._updatePrayerVisibility();
            });

            this._settings.connect('changed::' + 'hijri-date-adjustment', (settings, key) => {
                this._opt_hijriDateAdjustment = settings.get_int(key);

                this._updateLabel();
            });
        }

        _updatePrayerVisibility() {
            for (let prayerId in this._timeNames) {
                this._prayItems[prayerId].menuItem.actor.visible = this._isVisiblePrayer(prayerId);
            }
        }

        _isVisiblePrayer(prayerId) {
            return this._timeConciseLevels[prayerId] >= this._opt_concise_list;
        }

        _updateLabelPeriodic() {
            let currentSeconds = new Date().getSeconds();
            this._updateLabel();
            if (this._periodicTimeoutId) {
                GLib.source_remove(this._periodicTimeoutId);
            }
            if (currentSeconds === 0) {
                this._periodicTimeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    60,
                    () => {
                        this._updateLabel();
                        return true;
                    }
                );
            } else {
                this._periodicTimeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    60 - currentSeconds,
                    () => {
                        this._updateLabelPeriodic();
                        return true;
                    }
                );
            }
        }

        _updateLabel() {
            let displayDate = GLib.DateTime.new_now_local();
            let dateFormattedFull = displayDate.format(this._dateFormatFull);

            let myLocation = [this._opt_latitude, this._opt_longitude];
            let myTimezone = this._timezoneArr[this._opt_timezone];
            this._prayTimes.setMethod(this._calcMethodsArr[this._opt_calculationMethod]);
            this._prayTimes.adjust({ asr: this._madhabArr[this._opt_madhab] });
            
            let currentDate = new Date();

            let currentSeconds = this._calculateSecondsFromDate(currentDate);

            let timesStr;

            if (this._opt_timeformat12) {
                timesStr = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', '12h');
            } else {
                timesStr = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', '24h');
            }

            let timesFloat = this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', 'Float');

            let nearestPrayerId;
            let minDiffMinutes = Number.MAX_VALUE;
            let isTimeForPraying = false;
            for (let prayerId in this._timeNames) {

                let prayerName = this._timeNames[prayerId];
                let prayerTime = timesStr[prayerId];

                this._prayItems[prayerId].label.text = prayerTime;

                if (this._isPrayerTime(prayerId)) {

                    let prayerSeconds = this._calculateSecondsFromHour(timesFloat[prayerId]);

                    let ishaSeconds = this._calculateSecondsFromHour(timesFloat['isha']);
                    let fajrSeconds = this._calculateSecondsFromHour(timesFloat['fajr']);

                    if (prayerId === 'fajr' && currentSeconds > ishaSeconds) {
                        prayerSeconds = fajrSeconds + (24 * 60 * 60);
                    }

                    let diffSeconds = prayerSeconds - currentSeconds;

                    if (diffSeconds <= 0 && diffSeconds > -60) {
                        isTimeForPraying = true;
                        nearestPrayerId = prayerId;
                        break;
                    }

                    if (diffSeconds > 0) {
                        let diffMinutes = ~~(diffSeconds / 60);

                        if (diffMinutes <= minDiffMinutes) {
                            minDiffMinutes = diffMinutes;
                            nearestPrayerId = prayerId;
                        }
                    }

                }
            };


            let hijriDate = HijriCalendarKuwaiti.KuwaitiCalendar(this._opt_hijriDateAdjustment);

            let outputIslamicDate = this._formatHijriDate(hijriDate);

            this._dateMenuItem.label.text = outputIslamicDate;

            if ((minDiffMinutes === 15) || (minDiffMinutes === 10) || (minDiffMinutes === 5)) {
                Main.notify(_(minDiffMinutes + " minutes remaining until " + this._timeNames[nearestPrayerId]) + " prayer.", _("Prayer time : " + timesStr[nearestPrayerId]));
            }

            if (isTimeForPraying) {
                Main.notify(_("It's time for the " + this._timeNames[nearestPrayerId]) + " prayer.", _("Prayer time : " + timesStr[nearestPrayerId]));
                this.indicatorText.set_text(_("It's time for " + this._timeNames[nearestPrayerId]));
            } else {
                this.indicatorText.set_text(this._timeNames[nearestPrayerId] + ' -' + this._formatRemainingTimeFromMinutes(minDiffMinutes));
            }
        }

        _calculateSecondsFromDate(date) {
            return this._calculateSecondsFromHour(date.getHours()) + (date.getMinutes() * 60);
        }

        _calculateSecondsFromHour(hour) {
            return (hour * 60 * 60);
        }

        _isPrayerTime(prayerId) {
            return prayerId === 'fajr' || prayerId === 'dhuhr' || prayerId === 'asr' || prayerId === 'maghrib' || prayerId === 'isha';
        }

        _formatRemainingTimeFromMinutes(diffMinutes) {
            let hours = ~~(diffMinutes / 60);
            let minutes = ~~(diffMinutes % 60);

            let hoursStr = (hours < 10 ? "0" : "") + hours;
            let minutesStr = (minutes < 10 ? "0" : "") + minutes;

            return hoursStr + ":" + minutesStr;
        }

        _formatHijriDate(hijriDate) {
            return this._dayNames[hijriDate[4]] + ", " + hijriDate[5] + " " + this._monthNames[hijriDate[6]] + " " + hijriDate[7];
        }

        stop() {

            this.menu.removeAll();

            if (this._periodicTimeoutId) {
                GLib.source_remove(this._periodicTimeoutId);
            }
        }
    });

let azan;

export default class AzanExtension extends Extension {
    enable() {
        azan = new Azan();
        Main.panel.addToStatusArea('azan', azan, 1, 'center');
    }

    disable() {
        azan.stop();
        azan.destroy();
    }
}