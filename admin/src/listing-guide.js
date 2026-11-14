// The guide navigates the existing editor; it never creates fields or publishes a listing. A new draft opens with it
// (PUB-01), one step per family of data: PUB-04 to PUB-09. A section only the server switches on (compliance, content,
// documents) is a target while the listing brings it.
export function listingGuideSteps({ review = true, compliance = false, content = false, documents = false } = {}) {
  return [
    { label: 'Identification', targets: [['Details', 'h-details'], ['Internal property details', 'h-internal-address']] },
    { label: 'Physical', targets: [['Physical details', 'h-physical']] },
    { label: 'Financial', targets: [['Price', 'h-price']] },
    { label: 'Legal', targets: [compliance ? ['Legal and compliance', 'h-compliance'] : ['Details', 'h-details'],
      ...(documents ? [['Private documents', 'h-documents']] : [])],
      unavailable: compliance ? undefined : 'Additional legal fields are not available in this guide yet.' },
    { label: 'Marketing', targets: [['Description', 'h-desc'], ...(content ? [['Website content', 'h-content']] : []),
      ['Photos', 'h-photos'], ['Tour and specification', 'h-tour']] },
    { label: 'Review', targets: review ? [['Listing review', 'h-prepub'], ['History', 'h-history']] : [['Property status', 'h-editor']],
      unavailable: review ? undefined : 'The publication checklist is unavailable for an archived listing.' },
  ];
}
export function guideStepForSection(section) {
  return ({ 's-details': 0, 's-internal-address': 0, 's-physical': 1, 's-price': 2, 's-compliance': 3, 's-documents': 3,
    's-description': 4, 's-photos': 4, 's-tour': 4 })[section] ?? null;
}
