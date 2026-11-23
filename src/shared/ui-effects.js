(function (global) {
  'use strict';

  var ns = (global.LbxSeerr = global.LbxSeerr || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function prefersReducedMotion() {
    return (
      typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function attachMagicCard(el) {
    if (!el || el.dataset.lbxMagicBound === '1') {
      return;
    }
    el.dataset.lbxMagicBound = '1';

    if (prefersReducedMotion()) {
      return;
    }

    el.addEventListener('pointermove', function (event) {
      var rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', Math.round(event.clientX - rect.left) + 'px');
      el.style.setProperty('--my', Math.round(event.clientY - rect.top) + 'px');
    });

    el.addEventListener('pointerleave', function () {
      el.style.setProperty('--mx', '-280px');
      el.style.setProperty('--my', '-280px');
    });
  }

  function createBorderBeam(tone) {
    var beam = document.createElement('div');
    beam.className = 'lbx-border-beam';
    beam.setAttribute('aria-hidden', 'true');
    if (tone) {
      beam.setAttribute('data-beam-tone', tone);
    }
    var light = document.createElement('div');
    light.className = 'lbx-border-beam-light';
    beam.appendChild(light);
    return beam;
  }

  function createShimmerButton(options) {
    var opts = options || {};
    var isLink = opts.tag === 'a';
    var btn = document.createElement(isLink ? 'a' : 'button');
    var variantClass =
      opts.variant === 'jellyfin'
        ? ' lbx-shimmer-jellyfin'
        : opts.variant === '4k'
          ? ' lbx-shimmer-4k'
          : '';

    btn.className =
      'lbx-shimmer-btn' + variantClass + (opts.className ? ' ' + opts.className : '');

    if (isLink) {
      if (opts.href) {
        btn.href = opts.href;
      }
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
    } else {
      btn.type = opts.type || 'button';
      btn.disabled = Boolean(opts.disabled);
    }

    var spark = document.createElement('span');
    spark.className = 'lbx-shimmer-spark';
    spark.setAttribute('aria-hidden', 'true');
    var conic = document.createElement('span');
    conic.className = 'lbx-shimmer-conic';
    spark.appendChild(conic);

    var backdrop = document.createElement('span');
    backdrop.className = 'lbx-shimmer-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    var highlight = document.createElement('span');
    highlight.className = 'lbx-shimmer-highlight';
    highlight.setAttribute('aria-hidden', 'true');

    var content = document.createElement('span');
    content.className = 'lbx-shimmer-content';

    if (opts.loading) {
      var spinner = document.createElement('span');
      spinner.className = 'lbx-seerr-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      content.appendChild(spinner);
    } else if (opts.iconNode) {
      content.appendChild(opts.iconNode);
    }

    var textSpan = document.createElement('span');
    textSpan.textContent = opts.label || '';
    content.appendChild(textSpan);

    btn.appendChild(spark);
    btn.appendChild(backdrop);
    btn.appendChild(highlight);
    btn.appendChild(content);

    return btn;
  }

  function createStatusPlate(status, options) {
    var opts = options || {};
    var meta = ns.utils.getMediaStatusMeta(status);
    var plate = document.createElement('span');
    plate.className =
      'lbx-status-plate lbx-tone-' +
      meta.tone +
      (opts.fullWidth ? ' lbx-status-plate-full' : '');
    plate.setAttribute('role', 'status');

    var well = document.createElement('span');
    well.className = 'lbx-led-well';
    well.setAttribute('aria-hidden', 'true');

    var dot = document.createElement('span');
    dot.className = 'lbx-led-dot';
    well.appendChild(dot);

    var label = document.createElement('span');
    label.textContent = opts.labelOverride || meta.label;

    plate.appendChild(well);
    plate.appendChild(label);
    return plate;
  }

  function createChevronIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'lbx-select-chevron');
    svg.setAttribute('aria-hidden', 'true');

    var up = document.createElementNS(SVG_NS, 'path');
    up.setAttribute('d', 'm7 15 5 5 5-5');
    var down = document.createElementNS(SVG_NS, 'path');
    down.setAttribute('d', 'm7 9 5-5 5 5');

    svg.appendChild(up);
    svg.appendChild(down);
    return svg;
  }

  function createSelectWrap(selectEl) {
    selectEl.classList.add('lbx-select');
    var wrap = document.createElement('div');
    wrap.className = 'lbx-select-wrap';
    wrap.appendChild(selectEl);
    wrap.appendChild(createChevronIcon());
    return wrap;
  }

  ns.ui = {
    attachMagicCard: attachMagicCard,
    createBorderBeam: createBorderBeam,
    createShimmerButton: createShimmerButton,
    createStatusPlate: createStatusPlate,
    createSelectWrap: createSelectWrap
  };
})(globalThis);
