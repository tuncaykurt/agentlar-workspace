"use client";
import React, { useEffect, useRef } from "react";
import { createChart, ColorType, ISeriesApi, LineStyle } from "lightweight-charts";

interface HFTChartProps {
  currentPrice: number;
  upperGrid: number;
  lowerGrid: number;
  historyData?: { time: string | number; value: number }[];
}

export default function HFTChart({ currentPrice, upperGrid, lowerGrid, historyData }: HFTChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const upperLineRef = useRef<any>(null);
  const lowerLineRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "#1e293b", style: LineStyle.SparseDotted },
        horzLines: { color: "#1e293b", style: LineStyle.SparseDotted },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 250,
    });

    const series = chart.addAreaSeries({
      lineColor: "#6366f1", // Indigo 500
      topColor: "rgba(99, 102, 241, 0.4)",
      bottomColor: "rgba(99, 102, 241, 0.0)",
      lineWidth: 2,
    });

    if (historyData && historyData.length > 0) {
      // Need to format dates for lightweight charts (must be standard timestamp or string format)
      series.setData(historyData as any);
    }

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [historyData]);

  // Update real-time price and Grid Lines
  useEffect(() => {
    if (!seriesRef.current || currentPrice === 0) return;

    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    
    // Anlık fiyat noktası ekle
    seriesRef.current.update({ time: now as any, value: currentPrice });

    // Dinamik Grid Çizgilerini Güncelle
    if (upperGrid > 0) {
      if (upperLineRef.current) {
        seriesRef.current.removePriceLine(upperLineRef.current);
      }
      upperLineRef.current = seriesRef.current.createPriceLine({
        price: upperGrid,
        color: "#ef4444", // Red
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Üst Ağ Sınırı",
      });
    }

    if (lowerGrid > 0) {
      if (lowerLineRef.current) {
        seriesRef.current.removePriceLine(lowerLineRef.current);
      }
      lowerLineRef.current = seriesRef.current.createPriceLine({
        price: lowerGrid,
        color: "#22c55e", // Green
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Alt Ağ Sınırı",
      });
    }
  }, [currentPrice, upperGrid, lowerGrid]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
