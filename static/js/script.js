document.addEventListener("DOMContentLoaded", () => {
  const basePinnedColumns = [
    "Cash Flow Main 4",
    "Cash Flow Main 3",
    "Cash Flow Main 2",
    "Cash Flow Main 1",
    "Cash Flow Category",
  ];
  const allPinnedColumns = ["transaction_currency_code"].concat(
    basePinnedColumns,
  );
  let availablePinnedColumns = [];

  function rowSpan(params) {
    if (!params.data || !params.column || !params.api) return 1;
    const column = params.column.colId;
    const rowIndex = params.rowIndex;
    const rowData = params.data;
    let spanCount = 1;

    for (let i = rowIndex + 1; i < params.api.getDisplayedRowCount(); i++) {
      const nextData = params.api.getDisplayedRowAtIndex(i).data;
      if (nextData && nextData[column] === rowData[column]) {
        spanCount++;
      } else {
        break;
      }
    }
    return spanCount;
  }

  const gridOptions = {
    defaultColDef: {
      flex: 1,
      minWidth: 100,
      resizable: true,
      sortable: true,
      filter: true,
      cellClass: (params) => {
        if (
          params.data &&
          (params.data["Cash Flow Main 4"] === "Opening Balance" ||
            params.data["Cash Flow Main 4"] === "Closing Balance")
        ) {
          return params.colDef.field === "Cash Flow Main 4"
            ? "balance-label-cell"
            : "balance-value-cell";
        }
        return null;
      },
      cellStyle: (params) => {
        if (
          params.data &&
          (params.data["Cash Flow Main 4"] === "Opening Balance" ||
            params.data["Cash Flow Main 4"] === "Closing Balance")
        ) {
          return params.colDef.field === "Cash Flow Main 4"
            ? { textAlign: "left" }
            : { textAlign: "right" };
        }
        return null;
      },
    },
    autoGroupColumnDef: {
      headerName: "Account Currency",
      field: "transaction_currency_code",
      cellRenderer: "agGroupCellRenderer",
      cellRendererParams: {
        suppressCount: true,
        innerRenderer: (params) => {
          if (
            params.node.group &&
            params.node.field === "transaction_currency_code"
          ) {
            return `<div class="currency-cell">${params.node.key}</div>`;
          } else {
            return params.value;
          }
        },
      },
    },
    rowGroupPanelShow: "always",
    groupDefaultExpanded: -1,
    columnDefs: [],
    rowData: [],
    suppressRowTransform: true,
  };

  const gridDiv = document.querySelector("#myGrid");
  const gridApi = agGrid.createGrid(gridDiv, gridOptions);

  function updateColumns(columnNames, includeCurrency) {
    const pinnedColumns = includeCurrency
      ? allPinnedColumns
      : basePinnedColumns;
    const orderedColumnNames = pinnedColumns.concat(
      columnNames.filter((name) => !pinnedColumns.includes(name)),
    );

    const columnDefs = orderedColumnNames.map((key) => ({
      headerName:
        key === "transaction_currency_code" ? "Account Currency" : key,
      field: key,
      sortable: true,
      filter: true,
      pinned: pinnedColumns.includes(key) ? "left" : null,
      rowSpan: rowSpan,
      cellClassRules: {
        "cell-span": 'value && value !== ""',
      },
    }));
    gridApi.updateGridOptions({ columnDefs: columnDefs });
    updateColumnControlPanel(
      columnDefs.filter((col) => basePinnedColumns.includes(col.field)),
    );
  }

  function fetchData(startDate, endDate, includeCurrency = false) {
    let url = "/get-data-CF";
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }
    if (includeCurrency) {
      url += url.includes("?") ? "&" : "?";
      url += "include_currency=true";
    }

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Network response was not ok: " + response.statusText,
          );
        }
        return response.json();
      })
      .then((response) => {
        const data = JSON.parse(response.json_data_CF);
        if (data && data.length > 0) {
          const columnNames = Object.keys(data[0]);
          updateColumns(columnNames, includeCurrency);
          gridApi.updateGridOptions({ rowData: data });
          availablePinnedColumns = allPinnedColumns.filter(
            (col) => !columnNames.includes(col),
          );
          updateAvailableColumnsDropdown();
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        fetch(url)
          .then((response) => response.text())
          .then((text) => console.log("Response was:", text));
      });
  }

  const startDatePicker = flatpickr('input[name="start_date"]', {
    dateFormat: "Y-m-d",
  });
  const endDatePicker = flatpickr('input[name="end_date"]', {
    dateFormat: "Y-m-d",
  });

  document.getElementById("dateFilterBtn").addEventListener("click", () => {
    const startDate = startDatePicker.input.value;
    const endDate = endDatePicker.input.value;
    if (startDate && endDate) {
      fetchData(
        startDate,
        endDate,
        document.getElementById("currencyToggle").checked,
      );
    }
  });

  fetchData();

  document.getElementById("currencyToggle").addEventListener("change", () => {
    const startDate = startDatePicker.input.value;
    const endDate = endDatePicker.input.value;
    fetchData(
      startDate,
      endDate,
      document.getElementById("currencyToggle").checked,
    );
  });

  function isColumnOrderValid(currentOrder) {
    let indexMap = currentOrder
      .map((column) => allPinnedColumns.indexOf(column))
      .filter((index) => index !== -1);
    return indexMap.every((val, i, arr) => !i || val > arr[i - 1]);
  }

  function updateColumnControlPanel(columnDefs) {
    const panel = document.getElementById("activeColumns");
    panel.innerHTML = "";
    columnDefs.forEach((col) => {
      const colDiv = document.createElement("div");
      colDiv.textContent = `${col.headerName} `;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "x";
      removeBtn.onclick = () => removeColumn(col.field);
      colDiv.appendChild(removeBtn);
      panel.appendChild(colDiv);
    });
    updateAvailableColumnsDropdown();
  }

  function removeColumn(field) {
    const allColumns = gridApi.getColumnDefs();
    const newColumnDefs = allColumns.filter((col) => col.field !== field);
    if (!isColumnOrderValid(newColumnDefs.map((def) => def.field))) {
      alert("Removing this column would result in invalid data aggregation.");
      return;
    }
    availablePinnedColumns.push(field);
    gridApi.updateGridOptions({ columnDefs: newColumnDefs });
    updateColumnControlPanel(
      newColumnDefs.filter((col) => basePinnedColumns.includes(col.field)),
    );
    updateAvailableColumnsDropdown();
  }

  function updateAvailableColumnsDropdown() {
    const dropdown = document.getElementById("availableColumns");
    if (!dropdown) {
      console.error("Dropdown element not found");
      return;
    }
    dropdown.innerHTML = "";
    availablePinnedColumns.forEach((field) => {
      const option = new Option(field, field);
      dropdown.add(option);
    });
  }

  window.addColumn = function () {
    const dropdown = document.getElementById("availableColumns");
    const fieldToAdd = dropdown.value;
    if (!fieldToAdd) return;
    const allColumns = gridApi.getColumnDefs();
    const columnToAdd = {
      headerName: fieldToAdd,
      field: fieldToAdd,
      sortable: true,
      filter: true,
      pinned: "left",
    };
    const newColumnDefs = [...allColumns, columnToAdd];
    if (!isColumnOrderValid(newColumnDefs.map((def) => def.field))) {
      alert("Adding this column would result in invalid data aggregation.");
      return;
    }
    gridApi.updateGridOptions({ columnDefs: newColumnDefs });
    availablePinnedColumns = availablePinnedColumns.filter(
      (col) => col !== fieldToAdd,
    );
    updateColumnControlPanel(
      newColumnDefs.filter((col) => basePinnedColumns.includes(col.field)),
    );
    updateAvailableColumnsDropdown();
  };
});
