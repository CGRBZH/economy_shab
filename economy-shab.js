// Set up
const DATA_URL =
  "https://raw.githubusercontent.com/statistikZH/economy_SHAB/master/Economy_SHAB.csv?token=ALJEHNUR3CYKD2DQD3KLTXS66QMAU";

const dispatch = d3.dispatch("updatelocation", "updateyear");
//const colors = ["#ebc2ff", "#a27ffb", "#5f45c5", "#111188"];
const colors = ["#a9dfff", "#009ee0", "#0076bd", "#00456f"];

// Process data
d3.csv(DATA_URL).then((csv) => {
  // Convert all date to 2020 so they can be plotted on the same x time axis
  const parseTime = d3.timeParse("%Y-%m-%d");
  csv.forEach((d) => {
    d.value = +d.value;
    d.year = d.date.slice(0, 4);
    d.time = parseTime(`2020-${d.date.slice(5)}`);
  });
  // Group data
  const grouped = d3
    .nest()
    .key((d) => d.location)
    .key((d) => d.year)
    .entries(csv);
  const dataCH = d3
    .nest()
    .key((d) => d.year)
    .key((d) => d.date)
    .rollup((leaves) =>
      Object.assign({}, leaves[0], {
        location: "CH",
        value: d3.sum(leaves, (d) => d.value),
      })
    )
    .entries(csv);
  dataCH.forEach((d) => (d.values = d.values.map((e) => e.value)));
  const data = [
    {
      key: "CH",
      values: dataCH,
    },
    ...grouped,
  ];
  // Calculate cumulative sum
  data.forEach((d) =>
    d.values.forEach((e) =>
      e.values.forEach((p, i) => {
        if (i === 0) {
          p.total = p.value;
        } else {
          p.total = p.value + e.values[i - 1].total;
        }
      })
    )
  );
  const locations = data.map((d) => d.key);
  const years = data[0].values.map((d) => d.key);
  renderLocationSelect({
    options: locations,
    dispatch,
  });
  renderYearSelect({
    options: years,
    colors,
    dispatch,
  });
  const chart = renderChart({
    data,
  });
  chart.update({
    location: locations[0],
    years: years.slice(),
  });

  dispatch.on("updatelocation", (location) => {
    chart.update({
      location,
    });
  });

  dispatch.on("updateyear", (years) => {
    chart.update({
      years,
    });
  });
});

// Location select
function renderLocationSelect({ options, dispatch }) {
  const select = d3.select("#location-select");
  select
    .selectAll("option")
    .data(options)
    .join("option")
    .attr("value", (d) => d)
    .text((d) => d);
  select.on("change", function () {
    dispatch.call("updatelocation", null, this.value);
  });
}

// Year select
function renderYearSelect({ options, colors, dispatch }) {
  const select = d3.select("#year-select").classed("legend", true);
  let selected = new Set(options);
  const option = select
    .selectAll(".legend-item")
    .data(d3.zip(options, colors).map((d) => ({ value: d[0], color: d[1] })))
    .join("div")
    .attr("class", "legend-item")
    .on("click", toggle);
  option
    .append("div")
    .attr("class", "legend-swatch")
    .style("border-color", (d) => d.color)
    .style("background-color", (d) => d.color);
  option
    .append("div")
    .attr("class", "legend-value")
    .text((d) => d.value);

  function toggle(d) {
    if (selected.has(d.value)) {
      if (selected.size === 1) {
        selected = new Set(options);
      } else {
        selected.delete(d.value);
      }
    } else {
      selected.add(d.value);
    }

    option
      .select(".legend-swatch")
      .style("background-color", (d) =>
        selected.has(d.value) ? d.color : "#ffffff"
      );

    dispatch.call(
      "updateyear",
      null,
      options.filter((d) => selected.has(d))
    );
  }
}

// Line chart
function renderChart({ data }) {
  let svgWidth, svgHeight, width, height;
  const margin = {
    top: 20,
    right: 10,
    bottom: 30,
    left: 50,
  };

  const selected = {
    location: null,
    years: null,
  };

  // Scales
  const xScale = d3
    .scaleTime()
    .domain([new Date(2020, 0, 1), new Date(2020, 11, 31)]);
  const yScale = d3.scaleLinear();
  const colorScale = d3
    .scaleOrdinal()
    .domain(data[0].values.map((d) => d.key))
    .range(colors);

  // Line path generator
  const line = d3
    .line()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.total));

  // Voronoi diagram for hovering point determination
  const voronoi = d3
    .voronoi()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.total));

  // Container
  const container = d3.select("#economy-shab-chart");
  const svg = container.append("svg");
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const gLines = g.append("g").attr("class", "lines");
  const gXAxis = g.append("g").attr("class", "x axis");
  const xTitle = g.append("text").text("Kumulierte Tageswerte").attr("dy", "-6");
  const gYAxis = g.append("g").attr("class", "y axis");
  const gFocus = g.append("g").attr("class", "focus").style("display", "none");
  const focusHorizontalLine = gFocus.append("line").attr("class", "focus-line");
  const focusVerticalLine = gFocus.append("line").attr("class", "focus-line");
  const focusCircle = gFocus
    .append("circle")
    .attr("class", "focus-circle")
    .attr("r", 5);
  const gVoronoi = g.append("g").attr("class", "voronoi");
  const tooltip = container
    .append("div")
    .attr("class", "tooltip")
    .style("display", "none");

  window.addEventListener("resize", render);

  function render() {
    // Dimensions
    svgWidth = container.node().clientWidth;
    svgHeight = container.node().clientHeight;
    width = svgWidth - margin.left - margin.right;
    height = svgHeight - margin.top - margin.bottom;
    svg.attr("width", svgWidth).attr("height", svgHeight);
    voronoi.extent([
      [-1, -1],
      [width + 1, height + 1],
    ]);

    // Selected data
    const selectedData = data
      .find((d) => d.key === selected.location)
      .values.filter((d) => selected.years.includes(d.key));
    const maxTotal = d3.max(
      selectedData,
      (d) => d.values[d.values.length - 1].total
    );

    // Scales
    xScale.range([0, width]);
    yScale.domain([0, maxTotal]).range([height, 0]).nice();

    // Render lines
    gLines
      .selectAll(".line")
      .data(selectedData, (d) => d.key)
      .join("path")
      .attr("class", "line")
      .attr("stroke", (d) => colorScale(d.key))
      .attr("d", (d) => line(d.values));

    // Render x axis
    gXAxis
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat((d) => d3.timeFormat("%b")(d)));

    // Render y axis
    gYAxis.call(d3.axisLeft(yScale).ticks(height / 80));

    // Update voronoi
    gVoronoi
      .selectAll(".voronoi-polygon")
      .data(voronoi.polygons(d3.merge(selectedData.map((d) => d.values))))
      .join("path")
      .attr("class", "voronoi-polygon")
      .attr("d", (d) => (d ? "M" + d.join("L") + "Z" : null))
      .on("mousemove", moved)
      .on("mouseenter", entered)
      .on("mouseleave", left);
  }

  function moved(d) {
    // Position tooltip
    const padding = 6;
    const focusRect = focusCircle.node().getBoundingClientRect();
    const containerRect = container.node().getBoundingClientRect();
    const tooltipRect = tooltip.node().getBoundingClientRect();
    let translateX =
      focusRect.x +
      focusRect.width / 2 -
      tooltipRect.width / 2 -
      containerRect.x;
    if (translateX < 0) {
      translateX = 0;
    } else if (translateX > containerRect.width - tooltipRect.width) {
      translateX = containerRect.width - tooltipRect.width;
    }
    let translateY =
      focusRect.y - padding - tooltipRect.height - containerRect.y;
    if (translateY < 0) {
      translateY = focusRect.y + focusRect.height + padding - containerRect.y;
    }
    tooltip.style("transform", `translate(${translateX}px,${translateY}px)`);
  }

  function entered(d) {
    gFocus.style("display", null);
    focusCircle
      .attr("fill", colorScale(d.data.year))
      .attr(
        "transform",
        `translate(${xScale(d.data.time)},${yScale(d.data.total)})`
      );
    focusHorizontalLine
      .attr("x1", xScale(d.data.time))
      .attr("y1", yScale(d.data.total))
      .attr("x2", 0)
      .attr("y2", yScale(d.data.total));
    focusVerticalLine
      .attr("x1", xScale(d.data.time))
      .attr("y1", yScale(d.data.total))
      .attr("x2", xScale(d.data.time))
      .attr("y2", height);
    tooltip.style("border-color", colorScale(d.data.year)).html(`
        <div>Datum: ${d.data.date}</div>
        <div>Total: ${d3.format(",")(d.data.total)}</div>
      `);
    tooltip.style("display", null);
  }

  function left() {
    gFocus.style("display", "none");
    tooltip.style("display", "none");
  }

  function update({ location, years }) {
    if (location) selected.location = location;
    if (years) selected.years = years;
    render();
  }

  return {
    update,
  };
}
