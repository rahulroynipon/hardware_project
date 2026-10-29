import React, { useState, useRef } from 'react';

const DEFAULT_BANNER = 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=800&q=80';

// Helpers to get local ISO string formatted for input datetime-local: YYYY-MM-DDTHH:mm
function getNowLocalIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function getFutureLocalIso(hoursAhead = 6) {
  const d = new Date();
  d.setHours(d.getHours() + hoursAhead);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function formatDisplayDateTime(dtStr) {
  if (!dtStr) return '';
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function calculateDurationString(startStr, endStr) {
  if (!startStr || !endStr) return '5h 00m';
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;
  if (diffMs <= 0) return '0h 00m';
  const totalMin = Math.floor(diffMs / (1000 * 60));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}h ${mins < 10 ? '0' : ''}${mins}m`;
}

export default function CreateElectionModal({ isOpen, onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Details, Banner & Date Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [startDateTime, setStartDateTime] = useState(getNowLocalIso());
  const [endDateTime, setEndDateTime] = useState(getFutureLocalIso(6));

  const [isDragging, setIsDragging] = useState(false);
  const bannerFileRef = useRef(null);

  // Step 2: Candidates (Min 2, Max 4)
  const [candidates, setCandidates] = useState([
    {
      name: 'Sarah Johnson',
      order: 1,
      bio: 'A dedicated student leader committed to improving campus life for all.',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
    },
    {
      name: 'Michael Chen',
      order: 2,
      bio: 'Passionate about innovation and creating more opportunities for students.',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80'
    },
    {
      name: 'Priya Patel',
      order: 3,
      bio: 'Focused on building a more inclusive and vibrant university community.',
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80'
    }
  ]);

  if (!isOpen) return null;

  // Handle Banner Image File Selection / Drop
  function handleBannerFileChange(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setBannerImage(e.target.result);
      setError('');
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleBannerFileChange(e.dataTransfer.files[0]);
    }
  }

  // Handle Candidate Photo Upload
  function handleCandidatePhotoChange(index, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      handleCandidateChange(index, 'photo', e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function handleAddCandidate() {
    if (candidates.length >= 4) return;
    const nextOrder = candidates.length + 1;
    const slots = ['A', 'B', 'C', 'D'];
    setCandidates([
      ...candidates,
      {
        name: `Candidate ${slots[nextOrder - 1]}`,
        order: nextOrder,
        bio: 'Dedicated student candidate advocating for positive campus initiatives.',
        photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80'
      }
    ]);
  }

  function handleRemoveCandidate(index) {
    if (candidates.length <= 2) {
      alert('An election must have at least 2 candidates.');
      return;
    }
    const updated = candidates.filter((_, i) => i !== index).map((c, i) => ({ ...c, order: i + 1 }));
    setCandidates(updated);
  }

  function handleCandidateChange(index, field, value) {
    const updated = [...candidates];
    updated[index][field] = value;
    setCandidates(updated);
  }

  const durationText = calculateDurationString(startDateTime, endDateTime);

  async function handleFinalSubmit() {
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        title,
        description,
        banner_image: bannerImage || DEFAULT_BANNER,
        start_date: formatDisplayDateTime(startDateTime),
        end_date: formatDisplayDateTime(endDateTime),
        time_remaining: durationText,
        candidates
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <h2 className="modal-title">Create Election</h2>

        {/* 3-Step Stepper Header */}
        <div className="stepper-header">
          <div className={`step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
            <span className="step-circle">{step > 1 ? '✓' : '1'}</span>
            <span>Election Details</span>
          </div>

          <div style={{ width: '40px', height: '2px', background: step > 1 ? 'var(--primary)' : '#E2E8F0' }}></div>

          <div className={`step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
            <span className="step-circle">{step > 2 ? '✓' : '2'}</span>
            <span>Candidates</span>
          </div>

          <div style={{ width: '40px', height: '2px', background: step > 2 ? 'var(--primary)' : '#E2E8F0' }}></div>

          <div className={`step-item ${step === 3 ? 'active' : ''}`}>
            <span className="step-circle">3</span>
            <span>Review</span>
          </div>
        </div>

        {error && (
          <div className="alert-notice" style={{ marginBottom: '16px' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Details, Banner & Date Fields */}
        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px' }}>
              <div>
                {/* Title */}
                <div className="form-group">
                  <label className="form-label">Election Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Student Council Presidential Election 2024-2025"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe the purpose, eligibility, and rules of this election..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  ></textarea>
                </div>

                {/* Image Upload Area */}
                <div className="form-group">
                  <label className="form-label">Election Banner / Cover Image</label>
                  
                  {bannerImage ? (
                    <div className="image-preview-card">
                      <img src={bannerImage} alt="Election Banner Preview" />
                      <div className="image-preview-actions">
                        <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 600 }}>
                          ✓ Image Uploaded
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ background: '#FFFFFF', padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => bannerFileRef.current && bannerFileRef.current.click()}
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className="btn-danger-outline"
                            style={{ background: '#FFFFFF', padding: '4px 10px', fontSize: '11px', color: '#EF4444', borderColor: '#EF4444' }}
                            onClick={() => setBannerImage('')}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`image-dropzone ${isDragging ? 'drag-active' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => bannerFileRef.current && bannerFileRef.current.click()}
                    >
                      <div className="image-dropzone-icon">📷</div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px' }}>
                        Click to upload election image or drag & drop
                      </strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        PNG, JPG, WEBP, SVG (up to 10MB)
                      </span>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={bannerFileRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleBannerFileChange(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {/* Simple Start Date & End Date Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">📅 Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">⏰ End Date & Time (Deadline) *</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={endDateTime}
                      onChange={(e) => setEndDateTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="alert-notice" style={{ marginTop: '16px', marginBottom: '0' }}>
                  <span>⚡</span>
                  <div>
                    This election will save and go <strong>LIVE immediately</strong> with a <strong>{durationText}</strong> voting timer synced with the Arduino machine.
                  </div>
                </div>
              </div>

              {/* Preview Card on Right */}
              <div>
                <label className="form-label">Live Preview Card</label>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}>
                  <img
                    src={bannerImage || DEFAULT_BANNER}
                    alt="Election Preview"
                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: '14px' }}
                  />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-main)' }}>
                    {title || 'Student Council Election 2024-2025'}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                    {description ? (description.length > 90 ? description.slice(0, 90) + '...' : description) : 'Describe your election candidates, ballot rules, and guidelines.'}
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid #F1F5F9', paddingTop: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🕒</span>
                      <span>
                        <strong>Start:</strong> {formatDisplayDateTime(startDateTime)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>⏰</span>
                      <span>
                        <strong>Deadline:</strong> {formatDisplayDateTime(endDateTime)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 700 }}>
                      <span>⏳</span>
                      <span>
                        <strong>Timer Duration:</strong> {durationText}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '3px 8px', borderRadius: '4px' }}>
                      ● Saves Directly to Live
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Slots A–D
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px' }}>
              <button className="btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!title.trim()) {
                    setError('Please enter an election title');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
              >
                Next: Add Candidates &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Candidates */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Add Candidates (2 to 4)</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Upload candidate photos and configure names. Each candidate corresponds to hardware buttons A, B, C, D on the Arduino machine.
              </p>
            </div>

            <div className="candidates-grid">
              {candidates.map((cand, idx) => (
                <div key={idx} className="candidate-card-edit">
                  <button
                    className="candidate-delete-btn"
                    onClick={() => handleRemoveCandidate(idx)}
                    title="Remove candidate"
                  >
                    🗑️
                  </button>

                  {/* Candidate Photo with Upload Trigger */}
                  <label className="candidate-photo-wrapper" title="Click to upload candidate photo">
                    <img
                      src={cand.photo}
                      alt={cand.name}
                      className="candidate-photo-thumb"
                    />
                    <span className="candidate-photo-badge">📷</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleCandidatePhotoChange(idx, e.target.files[0]);
                        }
                      }}
                    />
                  </label>

                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontWeight: 700, textAlign: 'center' }}
                      value={cand.name}
                      placeholder="Candidate Name"
                      onChange={(e) => handleCandidateChange(idx, 'name', e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Hardware Button (Slot {['A', 'B', 'C', 'D'][idx]})
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={`Slot ${['A', 'B', 'C', 'D'][idx]} (Pin ${3 + idx})`}
                      readOnly
                      style={{ background: '#F8FAFC', textAlign: 'center', fontWeight: 600, fontSize: '11px' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Short Profile *</label>
                    <textarea
                      className="form-textarea"
                      style={{ minHeight: '60px', fontSize: '11px' }}
                      value={cand.bio}
                      placeholder="Candidate bio..."
                      onChange={(e) => handleCandidateChange(idx, 'bio', e.target.value)}
                    ></textarea>
                  </div>
                </div>
              ))}

              {/* + Add Candidate Card */}
              {candidates.length < 4 && (
                <div className="add-candidate-btn-card" onClick={handleAddCandidate}>
                  <span style={{ fontSize: '28px', lineHeight: 1 }}>+</span>
                  <strong style={{ fontSize: '13px', marginTop: '6px' }}>Add Candidate</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Slot {['A', 'B', 'C', 'D'][candidates.length]} (Max 4)
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button className="btn-outline" onClick={() => setStep(1)}>
                &larr; Back
              </button>
              <button className="btn-primary" onClick={() => setStep(3)}>
                Next: Review &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Election Details Review */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Election Overview</h3>
                  <button
                    onClick={() => setStep(1)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                  >
                    ✏️ Edit
                  </button>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <img
                    src={bannerImage || DEFAULT_BANNER}
                    alt="Banner Review"
                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid #E2E8F0' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Title</span>
                    <strong style={{ fontSize: '15px' }}>{title}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Description</span>
                    <p style={{ color: 'var(--text-main)', fontSize: '12px', lineHeight: 1.4 }}>{description || 'No description provided'}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Start Time</span>
                    <strong>{formatDisplayDateTime(startDateTime)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Deadline (Closing Time)</span>
                    <strong>{formatDisplayDateTime(endDateTime)}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                    <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                      ⚡ Saves Directly to Live
                    </span>
                    <span style={{ background: '#EFF6FF', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                      ⏳ Timer: {durationText}
                    </span>
                    <span style={{ background: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                      👥 {candidates.length} Candidates
                    </span>
                  </div>
                </div>
              </div>

              {/* Candidates Review */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Candidates ({candidates.length})</h3>
                  <button
                    onClick={() => setStep(2)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                  >
                    ✏️ Edit
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {candidates.map((cand, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', background: '#F8FAFC', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--primary)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                        {['A', 'B', 'C', 'D'][idx]}
                      </span>
                      <img
                        src={cand.photo}
                        alt={cand.name}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #CBD5E1' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: '13px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cand.name}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cand.bio}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-outline" onClick={() => setStep(2)}>
                &larr; Back
              </button>
              <button
                className="btn-primary"
                onClick={handleFinalSubmit}
                disabled={loading}
              >
                {loading ? 'Creating & Launching...' : 'Save & Launch Live Election'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
