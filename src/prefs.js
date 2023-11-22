import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as PrayTimes from './PrayTimes.js';

export default class ClipboardIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        const settingsUI = new Settings(window._settings);
        const page = new Adw.PreferencesPage();
        page.add(settingsUI.locationGroup);
        page.add(settingsUI.calculationGroup);
        page.add(settingsUI.displayGroup);
        window.add(page);
    }
}

class Settings {
    constructor(schema) {
        this.schema = schema;

        this.field_auto_location_toggle = new Adw.SwitchRow({
            title: _("Automatic location")
        });
        this.field_time_format_12_toggle = new Adw.SwitchRow({
            title: _("AM/PM time format")
        });
        this.field_latitude = new Adw.SpinRow({
            title: _("Latitude"),
            digits: 4,
            adjustment: new Gtk.Adjustment({
                lower: -90.0000,
                upper: 90.0000,
                step_increment: 0.0001
            })
        });
        this.field_longitude = new Adw.SpinRow({
            title: _("Longitude"),
            digits: 4,
            adjustment: new Gtk.Adjustment({
                lower: -180.0000,
                upper: 180.0000,
                step_increment: 0.0001
            })
        });
        this.field_hijri_date_adjustment = new Adw.SpinRow({
            title: _("Date adjustment"),
            adjustment: new Gtk.Adjustment({
                lower: -2,
                upper: 2,
                step_increment: 1
            })
        });
        this.field_calc_method_mode = new Adw.ComboRow({
            title: _("Calculation method"),
            model: this.#calcMethodOptions()
        });
        this.field_madhab_mode = new Adw.ComboRow({
            title: _("Madhab"),
            model: this.#madhabOptions()
        });
        this.field_timezone_mode = new Adw.ComboRow({
            title: _("Timezone"),
            model: this.#timezoneOptions()
        });
        this.field_which_times_mode = new Adw.ComboRow({
            title: _("Which times?"),
            model: this.#whichTimesOptions()
        });

        this.calculationGroup = new Adw.PreferencesGroup({ title: _('Calculation') });
        this.calculationGroup.add(this.field_hijri_date_adjustment);
        this.calculationGroup.add(this.field_calc_method_mode);
        this.calculationGroup.add(this.field_madhab_mode);
        this.calculationGroup.add(this.field_timezone_mode);
        this.locationGroup = new Adw.PreferencesGroup({ title: _('Location') });
        this.locationGroup.add(this.field_auto_location_toggle);
        this.locationGroup.add(this.field_latitude);
        this.locationGroup.add(this.field_longitude);
        this.displayGroup = new Adw.PreferencesGroup({ title: _('Display') });
        this.displayGroup.add(this.field_time_format_12_toggle);
        this.displayGroup.add(this.field_which_times_mode);

        this.schema.bind('auto-location',
            this.field_auto_location_toggle,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('time-format-12',
            this.field_time_format_12_toggle,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('latitude',
            this.field_latitude,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('longitude',
            this.field_longitude,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('hijri-date-adjustment',
            this.field_hijri_date_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('calculation-method',
            this.field_calc_method_mode,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('madhab',
            this.field_madhab_mode,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('timezone',
            this.field_timezone_mode,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );
        this.schema.bind('concise-list',
            this.field_which_times_mode,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );

        // enable/disable latitude and longitude fields
        let autoLocationActive = this.field_auto_location_toggle.active;
        this.field_latitude.sensitive = !autoLocationActive;
        this.field_longitude.sensitive = !autoLocationActive;

        this.field_auto_location_toggle.connect('notify::active', () => {
            autoLocationActive = this.field_auto_location_toggle.active;
            this.field_latitude.sensitive = !autoLocationActive;
            this.field_longitude.sensitive = !autoLocationActive;
        });
    }
    
    #calcMethodOptions() {
        let options = PrayTimes.getMethods();
        let list = new Gtk.StringList();
        for (let value of Object.entries(options)) {
            list.append(value[0]);
        }
        return list;
    }
    #madhabOptions() {
        let options = [
            _("Standard"),
            _("Hanafi")
        ];
        let list = new Gtk.StringList();
        for (let option of options) {
            list.append(option)
        }
        return list;
    }
    #timezoneOptions() {
        let options = [
            _("Auto"),
            _("GMT -12:00"),
            _("GMT -11:00"),
            _("GMT -10:00"),
            _("GMT -09:00"),
            _("GMT -08:00"),
            _("GMT -07:00"),
            _("GMT -06:00"),
            _("GMT -05:00"),
            _("GMT -04:00"),
            _("GMT -03:00"),
            _("GMT -02:00"),
            _("GMT -01:00"),
            _("GMT +00:00"),
            _("GMT +01:00"),
            _("GMT +02:00"),
            _("GMT +03:00"),
            _("GMT +04:00"),
            _("GMT +05:00"),
            _("GMT +06:00"),
            _("GMT +07:00"),
            _("GMT +08:00"),
            _("GMT +09:00"),
            _("GMT +10:00"),
            _("GMT +11:00"),
            _("GMT +12:00"),
            _("GMT +13:00"),
            _("GMT +14:00")
        ];
        let list = new Gtk.StringList();
        for (let option of options) {
            list.append(option)
        }
        return list;
    }
    #whichTimesOptions() {
        let options = [
            _("All times"),
            _("Concise")
        ];
        let list = new Gtk.StringList();
        for (let option of options) {
            list.append(option)
        }
        return list;
    }
}