import { CONTENT_TAGS, validateListingContent } from '../../server/listing-content.js';

// These are manually selected facts, not suggestions or a publication decision.
export default function ListingContentFields({value,onChange,errors={},busy=false}) {
  const video=value.video_url ?? '';
  const preview=validateListingContent({video_url:video || null});
  const changeTag=(tag,checked)=>onChange({...value,tags:checked
    ? [...value.tags,tag] : value.tags.filter(item=>item!==tag)});
  return <div className="content-fields" aria-labelledby="h-content">
    <h3 id="h-content">Website content</h3>
    <p className="muted">Choose only details confirmed for this listing.</p>
    <fieldset id="f-tags" tabIndex={-1} aria-describedby={errors.tags ? 'e-tags' : undefined}>
      <legend>Property tags</legend>
      {Object.entries(CONTENT_TAGS).map(([tag,label])=><label key={tag} className="check">
        <input type="checkbox" checked={value.tags.includes(tag)} disabled={busy}
          onChange={event=>changeTag(tag,event.target.checked)}/>{label}</label>)}
    </fieldset>
    {errors.tags && <small id="e-tags" className="err" role="alert">{errors.tags}</small>}
    <div className="field"><label htmlFor="f-video_url">Video player URL</label>
      <input id="f-video_url" type="url" value={video} maxLength={500} disabled={busy}
        aria-invalid={errors.video_url ? true : undefined}
        aria-describedby={errors.video_url ? 'e-video_url video-url-help' : 'video-url-help'}
        onChange={event=>onChange({...value,video_url:event.target.value})}/>
      <small id="video-url-help" className="muted">Use a Vimeo player or privacy-enhanced YouTube embed URL. The visitor chooses whether to load it.</small>
      {errors.video_url && <small id="e-video_url" className="err" role="alert">{errors.video_url}</small>}
      {!errors.video_url && video && preview.errors?.video_url && <small className="err" role="status">{preview.errors.video_url}</small>}
    </div>
  </div>;
}
