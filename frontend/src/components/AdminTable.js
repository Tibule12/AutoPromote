import React from "react";
import "../AdminDashboard.css";

const AdminTable = ({ data, columns, title, emptyMessage = "No data available" }) => {
  return (
    <div className="dashboard-panel">
      <h3 className="panel-title">{title}</h3>
      {data && data.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={index}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, colIndex) => (
                    <td key={colIndex}>
                      {column.render ? column.render(row) : row[column.accessor]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">{emptyMessage}</div>
      )}
    </div>
  );
};

export default AdminTable;
