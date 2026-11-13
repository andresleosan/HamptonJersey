// The guide navigates the existing editor; it never creates fields or publishes a listing.
export function listingGuideSteps({ review = true } = {}) {
  return [
    { label: 'Identification', targets: [['Details', 'h-details']] },
    { label: 'Physical', targets: [['Details', 'h-details'], ['Physical details', 'h-physical']] },
    { label: 'Financial', targets: [['Price', 'h-price']] },
    { label: 'Legal', targets: [['Details', 'h-details']], unavailable: 'Additional legal fields are not available in this guide yet.' },
    { label: 'Marketing', targets: [['Description', 'h-desc'], ['Photos', 'h-photos']] },
    { label: 'Review', targets: review ? [['Listing review', 'h-prepub']] : [['Property status', 'h-editor']],
      unavailable: review ? undefined : 'The publication checklist is unavailable for an archived listing.' },
  ];
}
export function guideStepForSection(section) {
  return ({ 's-details': 0, 's-internal-address': 0, 's-physical': 1, 's-price': 2,
    's-description': 4, 's-photos': 4, 's-tour': 4 })[section] ?? null;
}
