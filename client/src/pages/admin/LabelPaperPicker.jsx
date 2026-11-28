import { Link } from "react-router-dom";
import { CUSTOM_PRESET_ID, LABEL_PAPER_PRESETS } from "./printLabels";

/** Paper / roll size selector with a custom width × height option and print tips. */
export default function LabelPaperPicker({
  presetId,
  onPresetChange,
  custom,
  onCustomChange,
  preset,
  orientation,
  onOrientationChange,
  topGap,
  onTopGapChange,
  shopJob,
}) {
  return (
    <>
      <label>
        Paper / label size
        <select value={presetId} onChange={(event) => onPresetChange(event.target.value)}>
          {shopJob ? (
            <option value="shop">
              Shop setting · {shopJob.name} ({shopJob.w}×{shopJob.h} mm)
            </option>
          ) : null}
          {LABEL_PAPER_PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
          <option value={CUSTOM_PRESET_ID}>Custom size (mm)…</option>
        </select>
      </label>
      {presetId === CUSTOM_PRESET_ID && (
        <div className="label-custom-size">
          <label>
            Width (mm)
            <input
              type="number"
              inputMode="decimal"
              min="20"
              max="200"
              value={custom.w}
              onChange={(event) => onCustomChange({ ...custom, w: event.target.value })}
            />
          </label>
          <label>
            Height (mm)
            <input
              type="number"
              inputMode="decimal"
              min="15"
              max="200"
              value={custom.h}
              onChange={(event) => onCustomChange({ ...custom, h: event.target.value })}
            />
          </label>
        </div>
      )}
      {presetId === "shop" && shopJob ? (
        <p className="muted label-shop-note">
          {shopJob.w}×{shopJob.h} mm · {shopJob.orientation} · {shopJob.media === "continuous" ? "continuous" : "labels with gaps"}. Change this in{" "}
          <Link to="/admin/settings">Settings</Link>.
        </p>
      ) : null}
      {preset?.kind === "thermal" && presetId !== "shop" && (
        <label>
          Orientation
          <select value={orientation === "portrait" ? "portrait" : "landscape"} onChange={(event) => onOrientationChange(event.target.value)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
      )}
      {preset?.kind === "thermal" && presetId !== "shop" && (
        <label>
          Top gap (mm)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="6"
            step="0.5"
            value={topGap}
            onChange={(event) => onTopGapChange(event.target.value)}
          />
        </label>
      )}
    </>
  );
}
